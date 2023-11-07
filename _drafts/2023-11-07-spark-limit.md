---
layout: post
title: "spark硬核优化一/二  布隆过滤器大join优化/limit优化"
date: 2023-10-07 23:23:23
categories: bigdata
tags: bigdata spark
keywords: 布隆过滤器 join执行计划 Spark执行优化 BloomFilter
excerpt: 借助布隆过滤器解决两个大表join的性能问题. 深入分析和解决limit速度过慢的问题?
comments: true
---

分享记录几个在实际工作中解决的几个硬核spark优化的case, 所谓硬核就是不是简单的改改sql/调调配置就能解决的, 需要深入spark内部原理, 修改/扩展spark源码才能实现的优化.

这里是回忆整理了之前的两个case写成博客, 应该是最后一篇关于spark的博客了.

1. 借助布隆过滤器解决两个大表join的性能问题.
2. limit速度为什么这么慢?

* TOC
{:toc}

# 布隆过滤器解决两个大表join
## 场景
- **广告请求数据**

    我们的业务是程序化广告场景, 在这个业务中, 媒体侧(头腾快百)会将要展现广告的机会实时通过api发送给广告主(通过DSP或者自有RTA的形式), 广告主返回竞价信息. 这个过程产生的数据我们称为`广告请求数据`, 广告主侧可以保存下来. 由于广告主对接多家媒体的很多app, 这个广告请求的量级是相当大的, *每天达到千亿万亿条*.
- **广告曝光数据**

    另外, 媒体app中如果真的将某条广告展现给用户了, 媒体还会将展现的信息实时通过api发送给广告主, 这个数据我们称为`广告曝光数据`, 这个量级是*每天亿级别*的.

- **转化漏斗**
    
    在做分析的时候, 一个非常场景的是做转化漏斗分析. 即从不同维度去看, 从初始的这些广告请求数据, 有多少量级成功转化为曝光数据, 曝光之后有多少转化为点击, 点击转化为注册登录, 等等. 在做这个分析的时候, 我们需要将广告请求数据和广告曝光数据进行join.

    但是从刚才讲到的量级来看这两个表都非常大, 每天都是TB级, 为了节省资源加快计算, 我们之前做了如下改进.
    
- **前期尝试的优化**
    
    - 任务拆分
        按天拆分, `1天请求 join 1天曝光`, 再拆分媒体, `A媒体1天请求 join A媒体1天曝光`, 拆分之后再join, 量其实也很大
    - 传统的调整参数, map join等等手段. 
    - 同时我们为了节省资源, 我们只关注转化为曝光的请求, 也即改为`曝光 left join 请求`


我们观察到这两份数据还有一个特点, 左表(曝光)的量级是右表(请求)的1/1000, 请求数据中觉大多数都没必要参与计算的, 有什么方法能够对请求过滤一下, 只shuffle部分请求, 从而加快计算呢?
  

## 布隆过滤器介绍
### 思考?
{:.no_toc}
假设我们有百亿千亿个32位的字符串(md5hex), 然后给定一个md5字符串, 如何判断它是否在这个集合中呢? 我随便写一些思路

- 挨个遍历判断? 
- 用一个哈希set/字典结构来判断? 所需要的内存是单机能够承受的么?
- 用一种[bitset(位图)的结构](https://en.wikipedia.org/wiki/Bit_array), 将所有字符串哈希, 哈希取余得到一个索引, 用索引位置的0或者1表示是否存在于这个集合中. 
    一个字符串确实是占用1个bit位了, 但是总共哈希空间要多大啊? 哈希碰撞了怎么办?

这个bitset的思路虽然有些问题, 但是也引出了接下来的布隆过滤器的方案.

### 布隆过滤器BloomFilter
{:.no_toc}
> A bloom filter is a probabilistic data structure that is based on hashing. It is extremely space efficient and is typically used to add elements to a set and test if an element is in a set. Though, the elements themselves are not added to a set. Instead a hash of the elements is added to the set.
 
[布隆过滤器](https://en.wikipedia.org/wiki/Bloom_filter)是一种基于哈希的[概率数据结构](https://en.wikipedia.org/wiki/Category:Probabilistic_data_structures)。它具有极高的空间效率，通常用于将元素添加到集合中并测试元素是否在集合中。不过，元素本身并没有添加到集合中。相反，元素的散列被添加到集合中。

人话解释一下, 布隆过滤器是一种集合, 可以用来判断一个元素是否存在于一个集合中, 空间效率极高.

上述百亿千亿的字符串, 如果直接放在内存, 可能要几百个G, 但是在布隆过滤器, 顶多也就几个G, 几个G是单机内存(尤其是在spark的executer中)可以接受的

<img src="/resources/sparkbloomfilter/1.png" width="700" alt="1"/>

简单介绍一下BloomFilter的过程, 不是本文重点. 
- BloomFilter内部也有一个bitset空间
- 将每个初始元素(图中x,y,z), 进行k=3次哈希, 得到3个位置, 将3个位置置为1
- 初始元素都处理好之后, 这个bitset空间有很多位置被xyz置为1
- 对于一个新元素w, 要判断w是否存在于这个集合中, 也将w进行3次相同的哈希得到3个位置
  - 如果这3个位置都是1, 那么w大概率存在于这个集合中
  - 如何这3个位置有任何一个是0, 那么w一定不存在于这个集合中

这个算法需要调整bitset空间的大小, 哈希次数k等参数, 是一个概率数据结构. 有一定的假正率, 没有假负率.

对于我们的场景, 提前过滤请求减少shuffle数据量这个需求来讲, 多漏过一些假正的请求不影响正确性, 只要没有假负就好了, 恰好满足需求.

## 实现

### 自己实现
既然有了这个思路, 接下来考虑如何在spark中实现这个过程, 我不需要在sql语言层面改动, 只要支持两个dataframe使用bloomfilter再join就可以了. 我的设计思路是这样的:

<img src="/resources/sparkbloomfilter/2.png" width="700" alt="1"/>

这个实现方案有一些要点:
- Bloomfilter的实现. 自己写一个太吃力不讨好了, 之前研究druid的时候, 看过druid中bloomfilter是使用[datasketches](https://datasketches.apache.org/)包中的实现的, 可以用这个.
- 聚合算子: bloomfilter结构支持merge, 所以可以先单partition内部聚合成bloom结构, 然后多个bloom结构merge合并为一个.
- 广播: 因为我们对错误率的要求不那么高, 但是对内存大小希望小一点, 因为这个bloom结构要广播到所有执行节点内存中.
- 过滤: 过滤同上, 使用map_partitons类的算子, 每个executor只在内存中加载和保留一份bloom结构, 不要每次都重新加载.

### 大神的提交
在实现上述方案的过程中, 搜索到已经有大神们想到了这个优化方向. 其中

- [京东的人分享了一个博客](https://www.qinglite.cn/doc/461364775f7dbec77)但是没有代码开源.
- facebook分享提到了这个方案
- 来自ebay的[Yuming Wang为社区提交了一个PR](https://github.com/apache/spark/pull/29065)

既然已经有大神实现了, 我就不重复造轮子了, 上述只有那个PR是开源有代码的, 所以就尽量复用大神的逻辑, 当时这个PR还没有被合并(在spark3.3版本后被合并了), 所以我研究了其中的代码, 直接摘除关键部分copy到我们项目中, 这里分析一下大神的实现方法.





## 效果
TODO DAG图, 执行时间
# limit速度为什么这么慢?
## 场景&现象
limit语句在日常跑数的时候我们都经常使用, 比如想看一下数据的样子, 一般都会执行

{% highlight sql %}
select * from x limit 100;
{% endhighlight %}

这个语句的执行速度一般都非常快, 秒级别就看到数据展示出来了.

但是有时候有一些场景中, 我们需要limit的量级太大, 用limit就出奇的慢, 比如从一个100亿的表中`limit 1亿`或者从1亿1千万的表中`limit 1亿`都比预想的慢的多, 执行时间都到小时级了.

## 原因


## 解法