---
layout: post
title: "spark硬核优化2 limit优化"
date: 2023-10-07 23:23:23
categories: bigdata
tags: bigdata spark
keywords: Spark执行优化 spark limit
excerpt: 深入分析和解决limit速度过慢的问题
comments: true
---
深入分析和解决limit速度过慢的问题.

这里是回忆整理了之前的两个case写成博客, 应该是最后两篇关于spark的博客了.

分享记录几个在实际工作中解决的几个硬核spark优化的case, 所谓硬核就是不是简单的改改sql/调调配置就能解决的, 需要深入spark内部原理, 修改/扩展spark源码才能实现的优化.

* TOC
{:toc}

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

## 效果