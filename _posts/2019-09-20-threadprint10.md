---
layout: post
title: "一个多线程面试题"
date: 2019-09-20 23:23:23
categories: algo 
tags: java
comments: true
---

分享一道自己常用的多线程面试题.

* TOC
{:toc}

# 问题背景

> **使用两个线程打印1到10的数字, 要求按照顺序交替打印(一个线程打印奇数, 一个打印偶数)**

![pingpong](/resources/threadprint10/pingpong.gif)

多线程问题是java中比较难掌握的内容, 尤其是线程同步互斥问题, 概念细节非常多. 
不过这道题目简单可操作, 有很多很多解决方法, 所以我经常会问候选人, 不过有很多同学设计不出来, 或者有各种问题. 我这里用了几种方法实现了一下. (**图侵删**)

# 解决方法


(完整源码在 [这里](/resources/threadprint10/thread1To10.tgz) 或 [这里](https://gitee.com/tianzhipeng/CodeAccumulate/tree/master/src/main/java/cn/pugle/mianshi/thread1To10) )

虽然写了很多个类, 0是展示错误, 3和4是一样的, 所以大约提出了六七个方法吧. (代码为了展示现象打印到了100)

- 0 这个类先展示了两个bug的现象和原因
- 1  synchronized + 空转(或yield, 最差是sleep)
- 2 synchronized + wait/notify
- 3 volatile + yield (其实用不用volatile没啥区别, 在本例中不解决啥问题)
- 4 原子变量 + yield (其实用不用原子变量没啥区别, 在本例中不解决啥问题) 3,4是类似的, 有没有bug还待评估;
- 5 Lock + condition 和synchronized+wait方案很像了
- 6 Semaphore 大小为1的信号量, 和锁也是很像了
    - 6a. 用两个大小为1的Semaphore信号量
- 7 SynchronousQueue 传球Handoffs/交接棒的感觉. (换成两个阻塞队列也同理)

下面挑几个代码截图看一下.
## 0 展示问题
![0](/resources/threadprint10/0.png)

- 会出现1324这样的顺序, 加volatile加yield也不能解决.

  原因在于"get, 自增, 打印"这3步操作不原子, 线程1 get到3, 加到4, 打印3

  第二步和第三步之间, 线程2可以插进来执行自己的3步, 提前打印了4

- 有时会打印到100, 有时会到101. 加yield确实不出现这个问题, 但不可靠.

  出现101是因为线程2上一轮打印99增到100, 下一循环判断<=MAX时, 仍用的100判断, 这是线程1已经给加到101了, 线程2就能进入if把101打印了

  这个问题不是因为可见性, 所以用volatile也不行. 在if里 加上 && count <= MAX可以解决

## 2 synchronized + wait/notify
![2](/resources/threadprint10/2.png)

这是我觉得最标准的写法, 用了锁没有bug, 用wait/notify通知, 没有空转.
## 3 没有锁?
![3](/resources/threadprint10/3.png)

这个方法还不确定有没有bug, 直接用jmh run了好几分钟不出错不代表没有bug.
## 5 Lock + condition
![5](/resources/threadprint10/5.png)
## 6 Semaphore
![6](/resources/threadprint10/6.png)

计数的互斥信号量, 和锁类似.

有趣的是6a那个类里设计了用两个信号量的方法.
## 7 SynchronousQueue 同步队列
![7](/resources/threadprint10/7.png)

比较有趣的设计, 互相传球. 最后一轮怎么终止是难点, 就像头图的乒乓球一样.

用其他的BlockingQueue也可以, 或者类似6a这种用两个对象的思路.

# 性能/总结

用jmh跑了几次benchmark, 结果如下:

<pre>
PrintToTen1   avgt   10  2.994 ± 1.799  ms/op
PrintToTen6   avgt   10  2.869 ± 1.021  ms/op
PrintToTen6a  avgt   10  2.836 ± 1.176  ms/op
PrintToTen7   avgt   10  2.726 ± 1.111  ms/op
PrintToTen2   avgt   10  2.412 ± 0.847  ms/op
PrintToTen5   avgt   10  2.447 ± 0.988  ms/op
PrintToTen3   avgt   10  1.847 ± 0.523  ms/op
PrintToTen4   avgt   10  1.837 ± 0.495  ms/op
</pre>

可以看出, 无锁的方案3,4是最快的, 其次condition和wait方案也不错. 有锁又空转的最差.

解决这个问题时可能出的bug:
1. 共享的counter变量如何传递给两个线程

    我这里的代码用的是匿名类, 所以可以直接访问到外层类的成员变量, 直接用的基本类型int也不会有问题, 两个线程都读的是同一个变量; 如果不是这种匿名类, 而是单独的类, 那么如何让两个类使用同一个counter就是一个问题
    
    (一个方案是用AtomInteger这种包装类作为两个线程的构造参数).
2. 出现1324这种顺序;
3. 出现打印超过设置的最大值(10)
4. 空转. 这不是bug, 但是性能会差. 如果不用一些阻塞和通知机制, 必然会空转.
5. 两个线程同时count++导致计数器错了的问题. 首先在本题中我的那些写法即使不加锁也不会两线程同时++, 其次同时++也不会有啥问题.


一些结论:
1. 锁是最保险的, 原子性可见性什么的都有保障
2. 远离volatile
3. yield只是一个hint, 也就可能对性能有些好处, 对线程间同步问题什么用没有
4. 原子性, 可见性, 再加线程间通信的方式, 基本是多线程问题的难点
5. JUC包里是有些奇特的玩意


# 参考
1. [JUC包](https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/package-summary.html)
2. [简明高效的 Java 并发编程学习指南 - InfoQ](https://www.infoq.cn/article/1ggzj_oFl8wuJFwVG9et)