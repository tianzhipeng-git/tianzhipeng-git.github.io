---
layout: post
title: "spark-sql窗口函数原理/源码/bug分析"
date: 2021-11-14 23:23:23
categories: bigdata
tags: bigdata spark
keywords: Spark窗口函数 UDAF Spark窗口原理 Spark窗口聚合 WindowExec 扩张框
excerpt: Spark SQL中使用自定义窗口函数的时候遇到了bug, 自定义Spark UDAF, 深入理解Spark窗口执行原理WindowExec, 扩张框
comments: true
---

近期在Spark SQL中使用自定义窗口函数的时候遇到了bug, 自己研究了一下. 分析了窗口函数中扩张框/收缩框/滑动框等的执行细节.

* TOC
{:toc}

# 基本使用
窗口函数是sql中进行聚合分析的一项功能, 它作用于多行, 并为每行返回一个聚合结果. 
```
SELECT name, dept, RANK() OVER (PARTITION BY dept ORDER BY salary) AS rank FROM employees
```
## 和groupBy的区别
<img src="/resources/sparkwindow/1.png" width="1000"/>

它和普通的聚合(group by)类似, 但有如下区别:

- 聚合语句(group by)会使得数据行数变少, 根据聚合指定的key分组, 每组返回一行结果. 窗口函数则不改变行数, 虽然也是按key分组进行聚合分析, 但是为每行返回结果.
- 聚合语句只支持按key分组, 在组内进行运算. 窗口函数支持更复杂的逻辑, 同一分组内可以开窗, 根据不同窗口, 算出不同结果. (window就是a group of rows)
- 大多数聚合语句的函数同样能用于窗口中, 如sum/max/avg等, 但是窗口语句额外支持更多的函数, 如rank, lead, lag等. 内置的[aggregate functions](https://spark.apache.org/docs/latest/sql-ref-functions-builtin.html#aggregate-functions) vs 内置的[window functions](https://spark.apache.org/docs/latest/sql-ref-functions-builtin.html#window-functions)
- 通常情况讲, 聚合语句(group by)会比窗口语句执行成本更低. 几方面分析:
  -  groupBy语句根据函数不同, 可以partial+merge的方式运行, 也就是map端预聚合. window语句则都要在reduce端一次性聚合, 也就是只有complete执行模式.
  -  groupBy的物理执行计划分为SortBased和HashBased的, window则都是SortBased.
  -  window执行过程中需要更大的buffer进行汇总.

## 语法
在[Spark官方文档](https://spark.apache.org/docs/latest/sql-ref-syntax-qry-select-window.html)中, 详细描述了窗口函数的[语法](https://github.com/apache/spark/blob/master/sql/catalyst/src/main/antlr4/org/apache/spark/sql/catalyst/parser/SqlBase.g4)定义
{% highlight bash %}
window表达式:
    window_function OVER
    ( [  { PARTITION | DISTRIBUTE } BY partition_col_name = partition_col_val ( [ , ... ] ) ]
    { ORDER | SORT } BY expression [ ASC | DESC ] [ NULLS { FIRST | LAST } ] [ , ... ]
    [ window_frame ] )

window_frame(窗框定义):
    { RANGE | ROWS } { frame_start | BETWEEN frame_start AND frame_end }

frameBound(start或end):
    UNBOUNDED PRECEDING | offset PRECEDING | CURRENT ROW | offset FOLLOWING | UNBOUNDED FOLLOWING

offset: 
    specifies the offset from the position of the current row.
{% endhighlight %}
以及一些示例
{% highlight sql %}
SELECT name, dept, RANK() OVER (PARTITION BY dept ORDER BY salary) AS rank FROM employees;

SELECT name, dept, DENSE_RANK() OVER (PARTITION BY dept ORDER BY salary ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS dense_rank FROM employees;

SELECT name, salary, LAG(salary) OVER (PARTITION BY dept ORDER BY salary) AS lag,
    LEAD(salary, 1, 0) OVER (PARTITION BY dept ORDER BY salary) AS lead FROM employees;
{% endhighlight %}

可以看出window语句如下组成:
- 整体分为 `窗口函数` `OVER关键字` `窗口定义`.
- 窗口定义又分为三部分:
  - `partition分区信息`: 描述了在全量数据中按照哪个key分组. 必需的
  - `order排序信息`: 描述了组内数据如何排序. 可选的
  - `frame窗框定义`: 描述了分组排序好的数据上, 如何划定窗框. 可选的
    - RowType和RangeType两种类型
    - 5种边界值

这里必须详细介绍frame窗框
- RowType类型根据行偏移的范围来划定窗口, 对应语句中是`rows between xx and xx`
- RangeType类型根据order by指定的列的值的范围来划定窗口, 对应语句中是`range between xx and xx`
   举例来说, 如果有个商品销售记录表, 存放各商品销售明细, 如果要开窗计算每个商品过去7天销售价格的均值(每笔售价不同)的话, 就可以 
   ```
   select *, avg(price) over (partition by product_id order by dt range between 7 PRECEDING and current row)
   ```
   这里dt是数值表示的日期, 按日期排序, 窗口范围是[当前行的日期-7, 当前行的日期], 这里的7是对日期字段的offset值, 窗口范围内有多少行是不定的.
- 5种边界值
  - UNBOUNDED PRECEDING: 无限往前, 或者说从无限小/从第一行开始, 无上界. 对于RowType和RangeType是一个效果的.
  - UNBOUNDED FOLLOWING: 无限往后, 或者说是直到最后一行, 无下界. 对于RowType和RangeType是一个效果的.
  - offset PRECEDING: offset是一个数值 如30, 当是RowType时, 表示从当前行往前30行开始. 当RangeType时, 表示从当前行OrderBy那列的值减30开始(所以必须是能做减法的数值类型), 比如上面的MA30的例子, 是按dt日期排序, 取30天前到现在的范围定义的窗框.
  - offset FOLLOWING: 同上
  - CURRENT ROW: 当前行

可以看出, 窗框的划定还是很灵活的, 而且依赖我们定义好排序的列.

## 自定义窗口函数

Spark没有专门为窗口函数使用的基类, 用户自定义窗口函数, 需要继承自[org.apache.spark.sql.expressions.UserDefinedAggregateFunction](https://github.com/apache/spark/blob/27abcebf8da69f88c66ef43d651fc3db6bf8c2cb/sql/core/src/main/scala/org/apache/spark/sql/expressions/udaf.scala), 这个类就是实现普通UDAF的基类. 
> 没有测试继承Hive中的UDAF是否可以用于spark window

[官方测试代码中有一个window+udaf的例子](https://github.com/apache/spark/blob/27abcebf8da69f88c66ef43d651fc3db6bf8c2cb/sql/core/src/test/scala/org/apache/spark/sql/DataFrameWindowFunctionsSuite.scala#L466).

我们自己实现udaf的话, 主要实现如下关键方法:
- 输入数据schema: `inputSchema`: StructType 
- 执行过程中缓存数据schema: `bufferSchema`: StructType
- 返回数据类型: `dataType`: DataType

- 初始化的逻辑: `initialize`(buffer: MutableAggregationBuffer): Unit
- 使用新的输入行, 更新自己的buffer的逻辑: `update`(buffer: MutableAggregationBuffer, input: Row): Unit
- 合并两个buffer的逻辑: `merge`(buffer1: MutableAggregationBuffer, buffer2: Row): Unit ;在窗口聚合过程中这个方法不会被使用!
- 基于buffer和给定row, 计算最终result的逻辑: `evaluate`(buffer: Row): Any

## udaf出现Bug
写了一个很简单的udaf:
#### 功能场景
{:.no_toc}
{% highlight markdown %}
原始数据是:
mobile_no(手机号), device_id(设备ID), id_type(设备ID类型, IDFA/IMEI/OAID), dt(时间)

要写的UDAF返回true/false布尔值, 通过返回值标记这行是否保留: 
- 同一个mobile_no, 按日期排序, id_type为IDFA则保留最新的一个值, IMEI保留最新两个值
- IDFA和IMEI/OAID互斥, 最新出现的是iOS的IDFA, 则安卓设备ID全返回false
{% endhighlight %}
#### 我的代码逻辑
{:.no_toc}
- 类变量

  var result: Array[Boolean] = null

  var cur: Int = -1
- update函数: 什么也不做, 把输入数据放入buffer.
- evaluate函数: 

  ```
  if (result == null) {
      完成逻辑
      赋值result数组, 数组大小=update函数调用次数=输入行数
  }
  cur = cur + 1
  result(cur)
  ```

在执行到result(cur)这一行的时候, 任务报错:`ArrayIndexOutOfBoundsException: 2`, 但奇怪的是, 本地写的几个单元测试没有出错...

# 执行原理
## 执行计划
观察带有窗口语句的sql执行计划:
```
+- Window [devicemergeudaf(source#14, dtype#16, com.shuke.datawork.mapping.DeviceMergeUDAF@fd4459b, 0, 0) windowspecdefinition(mobile_no#12, last_date#15 DESC NULLS LAST, specifiedwindowframe(RangeFrame, unboundedpreceding$(), unboundedfollowing$())) AS valid#47], [mobile_no#12], [last_date#15 DESC NULLS LAST]
   +- *(2) Sort [mobile_no#12 ASC NULLS FIRST, last_date#15 DESC NULLS LAST], false, 0
      +- Exchange hashpartitioning(mobile_no#12, 200)
      ...
```
1. 是由一个专门的物理执行节点`Window`负责窗口语句的, 对应的是`WindowExec`这个类([源码](https://github.com/apache/spark/blob/4be566062defa249435c4d72eb106fe7b933e023/sql/core/src/main/scala/org/apache/spark/sql/execution/window/WindowExec.scala))
2. 在Window执行节点之前一般都现有Exchange和Sort两个节点

我们知道, 窗口语句也是按照partition by指定的列分组的, 所以必须要对数据按这个列进行shuffle重新分区. WindowExec将这个过程交给SparkSQL框架来做, 它在`requiredChildDistribution`方法中指定了自己需要的distribution方式, SparkSQL通过添加Exchange节点, 来满足它要求的数据分布. 排序也是同理, 见`requiredChildOrdering`方法.

## 核心源码分析
从WindowExec开始可以找到跟窗框执行有关的所有类, 几个核心类的分工如下
- WindowExec 物理执行逻辑入口
- WindowFunctionFrame 窗框执行抽象
- AggregateProcessor 窗框聚合, 调用各种窗口函数
- ScalaUDAF 自定义UDAF包装类
- UserDefinedAggregateFunction 自定义UDAF基类

下面分别介绍一下

### WindowExec
[WindowExec](https://github.com/apache/spark/blob/4be566062defa249435c4d72eb106fe7b933e023/sql/core/src/main/scala/org/apache/spark/sql/execution/window/WindowExec.scala) extends UnaryExecNode是一个一元的物理执行节点.

首先这个类先做一些准备工作, 主要是根据窗口表达式, 生成下面几个执行需要的核心类的对象, 主要在`windowFrameExpressionFactoryPairs`方法.

核心方法是`def doExecute(): RDD[InternalRow]`, 该方法定义了这个物理节点如何将child节点传来的数据进行处理返回新RDD, 在Spark SQL中, 所谓的`物理`也只是到了RDD层面的操作.

doExecute方法的内部逻辑是,  执行子节点exec, 并对RDD调用mapPartitions, 需要处理Iterator[InternalRow]并返回一个Iterator[InternalRow].

{% highlight scala %}
protected override def doExecute(): RDD[InternalRow] = {
    child.execute().mapPartitions { stream =>
        new Iterator[InternalRow] {
            //定义一些局部变量 (这个partition内可见)
            //定义一些辅助方法 (fetchNextPartition)
            override final def next(): InternalRow = { //实现迭代器接口next方法
                if (当前bufferIterator数据已经用完) fetchNextPartition()

                val current = bufferIterator.next()
                //对每个frames调用他们的write方法, 让他们写出结果
                while (i < numFrames) {
                    frames(i).write(rowIndex, current)
                }

                //把输入的row和窗口函数结果加在一起返回
                join(current, windowFunctionResult)
                result(join)
            }
        }
    }
}
{% endhighlight %}

`fetchNextPartition`做的事, 就是从子RDD的分区的`Iterator[InternalRow]`中, 每次读取同组的所有行(partition by列值相同的所有行). 它的执行逻辑, 依赖于RDD中的数据已经按照要求分区排序好了, 所以代码不复杂.
{% highlight scala %}
//把同一group的所有row放入buffer
while (nextRowAvailable && nextGroup == currentGroup) {
    buffer.add(nextRow)
    fetchNextRow() #读取nextRow, nextGroup
}

//对每个frames调用他们的prepare方法
while (i < numFrames) {
    frames(i).prepare(buffer)
}

bufferIterator = buffer.generateIterator()
{% endhighlight %}
### WindowFunctionFrame
可以看出WindowExec只负责了读取数据, 在两个时机调用了`frames(i).prepare`和`frames(i).write`方法, 对应的就是['WindowFunctionFrame'](https://github.com/apache/spark/blob/4be566062defa249435c4d72eb106fe7b933e023/sql/core/src/main/scala/org/apache/spark/sql/execution/window/WindowFunctionFrame.scala)这个接口.

上面说到窗框分为5种边界值, 在执行的时候, 被抽象为5个WindowFunctionFrame的实现类, 无论RowType还是RangeType类型.

* `UnboundedWindowFunctionFrame 全量框`, 对应无上界(UNBOUNDED PRECEDING), 无下界的窗框, 窗框直接包含分组内的所有数据.
* `UnboundedPrecedingWindowFunctionFrame 扩张框`, 对应无上界, 有确定下界(offset或当前行)的窗框, 处理过程中不断向窗框中加入数据.
* `UnboundedFollowingWindowFunctionFrame 收缩框`, 对应有确定上界, 无下界的窗框, 处理过程中从窗框中删除数据.
* `SlidingWindowFunctionFrame 滑动框`, 对应有确定上界, 有确定下界的窗框 , 处理过程中向窗框中加入新数据删除旧数据, 滑动效果.
* `OffsetWindowFunctionFrame 偏移框`, 特殊框体, 不用缓存数据, 窗框内只有和当前行偏移指定offset的一行, 用于LEAD/LAG.


其中又抽象出`BoundOrdering`类, 用于判断一行是否在界限内(Bound), 分为RowBoundOrdering和RangeBoundOrdering, 不再详解.

WindowFunctionFrame的两个接口方法:
- `prepare(rows: ExternalAppendOnlyUnsafeRowArray)`: Prepare the frame for calculating the results for a partition. 在WindowExec的fetchNextPartition中被调用, 接收到同组的所有输入行.
- `write(index: Int, current: InternalRow)`: Write the current results to the target row. 向target中写入当前行的计算结果. 一次一行.

<br/>
我们的UDAF在何时已什么顺序接受数据, 何时会被执行eval, 都取决于窗框内方法调用逻辑!

以扩张框(UnboundedPrecedingWindowFunctionFrame)为例
- 在prepare方法中, 拷贝了一份输入行的迭代器, 然后调用processor.initialize(input.length)方法.
- 在write方法中
  ```
    //先把界限内的行全都processor.update()
    while (nextRow != null && ubound.compare(nextRow, inputIndex, current, index) <= 0) {
      processor.update(nextRow)
      nextRow = WindowFunctionFrame.getNextOrNull(inputIterator)
      inputIndex += 1
      bufferUpdated = true
    }

    //调用processor.evaluate获得计算结果
    if (bufferUpdated) {
      processor.evaluate(target)
    }
  ```

而全量框的执行逻辑则不同
- 在prepare阶段, 直接把所有输入行都调用了processor.update
  ```
    processor.initialize(rows.length)
    val iterator = rows.generateIterator()
    while (iterator.hasNext) {
      processor.update(iterator.next())
    }
  ```
- 在write阶段只有一行代码: `processor.evaluate(target)`

### AggregateProcessor & ScalaUDAF
AggregateProcessor负责调用一个frame下的各个窗口函数, 起着包装/代理的功能, 它在构造的时候(伴生对象apply方法中), 将这个窗框所有要执行的函数分成两种:
- ImperativeAggregate extends AggregateFunction 命令式的. ScalaUDAF(也就是我们自定义函数的时候)属于此类.
- DeclarativeAggregate extends AggregateFunction 声明式的. 用sql写的各中窗口函数属于此类.

AggregateProcessor中三个关键方法: `initialize`, `update`, `evaluate`, 里面都是去调用具体Function的对应方法, 我们这个场景下就是调用ScalaUDAF.

(AggregateProcessor的类注释中有一句话, 'All AggregateFunctions are processed in Complete mode.')

<br/>

ScalaUDAF extends ImperativeAggregate with NonSQLExpression: The internal wrapper used to hook a UserDefinedAggregateFunction udaf in the internal aggregation code path.

ScalaUDAF对我们自己实现的UserDefinedAggregateFunction进行了包装, 它继承了ImperativeAggregate的方法, 混入了Expression接口, 除了这些胶水代码外, 最主要的功能有两个:
1. 管理各种converter. 我们在实现udaf的时候, 指定了我们需要的输入schema, 缓存schema, 输出类型, ScalaUDAF提供了converter做类型转换.
2. 管理udaf对聚合buffer的使用. 涉及到MutableAggBuffer(用于存储聚合函数自己的中间值)和InputAggBuffer两个buffer(预聚合模式下, 多个buffer合并时使用). 由于多个函数会共享buffer, 使用时要注意.


### UserDefinedAggregateFunction & MyUDAF
在上面[自定义窗口函数](#自定义窗口函数)已经介绍了.

## 时序图-扩张框
<img src="/resources/sparkwindow/2.png" width="1200"/>

# Bug分析
## 原因一 不了解WindowFrame机制
- 正式代码里用的window是`val window = Window.partitionBy($"mobile_no").orderBy($"last_date".desc)`
- 测试代码里用的window是`val window = Window.partitionBy($"mobile_no").orderBy($"last_date".desc).rangeBetween(Window.unboundedPreceding, Window.unboundedFollowing)`
- spark中不写range的默认range是Window.unboundedPreceding到Current Row, 也就是用的扩张框. 而我希望的逻辑应该是无上界无下界的全量框.
- udaf的eval代码中, 为了避免每一行eval的时候都执行一遍逻辑, 在判断result==null的第一次执行, 然后存在成员变量中. 虽然是优化考虑, 却埋下隐患.

上面讲到过, 扩张框是prepare阶段init一次, 然后write阶段循环update+evaluate, update和evaluate会交替被调用, 那么框内第一行数据的时候, result就被赋值为长度为1的数组了, 后面在update+evaluate的时候, 必然报错`ArrayIndexOutOfBoundsException`!

全量框是prepare阶段init一次+循环update, 然后write阶段循环evaluate, 就不会报错.

> 教训:
> 1. 测试用例要直接调用正式代码, 而不是从正式代码拷贝东西过来, 改来改去就不一致了
> 2. 测试用例的量级, 测试case要多一些, 考虑边界情况

在发现和修复上述问题, 修改增加了测试用例后, 本地运行测试通过, 发布集群运行竟然依旧报同样的异常!!  检查了在集群中现在运行的也是全量框了, 为什么还会出现update和evaluate的调用次数不一样的情况呢?

## 原因二 partition和对象重用
往两个方向思考过, 一是考虑出现rdd挂掉重算的情况, 会不会导致异常; 二是考虑udaf对象在不同节点和driver间是否会序列化传输的问题. 

后来意识到上面除了WindowExec以外的对象, 都是在`child.execute().mapPartitions { stream => { xxx }`里面新建出来的, 也就是说每个partition会构造新的frame对象/processor对象/udaf对象.
而且在这个partition所有行执行过程中, 没有重新构造这些对象, 而是**复用**了!!

udaf对象重用的话, 代码中result和cur两个成员变量保存了一个窗体内数据的临时结果, 到下一组的时候, 还是 != null的, 直接出问题了!

我的最新测试用例为什么还能通过? 
1. 测试用例数据量小, 而且测试用例中partition by字段只有两种值. 
2. 窗口函数前面有Exchange进行shuffle, 即使我一开始parallelize形成的rdd控制只有一个分区, 也会重新shuffle成200个分区的.
3. 这就导致了, 在我测试用例执行过程中, 每个分区只有数据同样的key的一组值, 没有测出由于udaf重用导致的bug!!

于是在测试用例中增加了多个mobile_no列的值, 让分组更多, 且配置`spark.sql.shuffle.partitions`为1, 让数据shuffle到一个分区写, 成功复现了bug!

> 教训:
> 1. Spark和Hadoop中, 由于数据量大, 构造对象成本高, 会重用很多东西, 一定要考虑对象的生命周期和复用.
> 2. 分布式执行的东西, 本地单元测试的时候, 确实很难测到, 更要仔细考虑.

问题发现后解决起来也比较简单了, 上面提到过, 每个窗框处理结束到新框数据的时候, 会调用全量框的prepare方法, 其中会调用udaf的initialize方法, 在这个时机, 我们清空result和cur对象为初始值即可.

## 自己之前的一些疑问
1. 窗口执行过程, 是要将同key的所有数据都读取并放入缓存, 然后再执行, 还是一条一条操作? 前者, 见fetchNextPartition.
2. UDAF的initialize/update/merge/evaluate几个方法的调用时机和顺序? 根据窗框不同, 调用时机和顺序不同. merge不会被调用!


# 参考资料
1. <<Spark SQL内核剖析>>
2. Spark源码

