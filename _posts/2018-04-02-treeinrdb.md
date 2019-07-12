---
layout: post
title: "关系型数据库中存储树形结构数据(hierarchical data)"
date: 2018-04-02 23:23:23
categories: database
tags: database hierarchical
comments: true
---
现实环境中总会遇到这样的需求, 在关系型数据库中存储 分类/继承/多级/树状 的数据. 比如:

- 公司的组织关系, 从上到下是树形的; 
- 生物分类, 界门纲目科属种;
- 博客文章的评论, 评论的回复, 的回复;

抛开需求谈技术优化, 都是耍流氓. 不同的需求对应的最佳解决方案是不同的, 各种方案有自己的优缺点和适用场景. 想要插入快呢? 想要移动快呢? 想要查询后代方便还是查询祖先方便?

有哪些解决方案, 需要考虑的点是什么?

---
# 方案

经过在网络上充分的搜索, 大体得出的解决方案分为四种. 整体介绍如图:

![介绍](/resources/treeinrdb/intro.png)

---
# Adjacency List

加一列存储自己的父级ID. 

- 查询直接的父子节点, join + parentId = xx即可解决.
- 但一涉及到多级的查询, 比如查所有后代, 查所有祖先, 就要上递归查询解决了.
- 移动子树只改一行的parentId就行.
- 插入节点, 存下parentId即可.

据信其他数据库支持CTE递归查WITH [RECURSIVE], Oracle支持connect by. MySQL不支持递归, 可用session var模拟, 很尴尬.

这个方案很简单, 也最常见.

这个方案的一些变种: Flat Table: 再加一个level列, 存上自己在哪级. 存上一个Order/Rank列支持排序.

---
# Path Enumeration

加一列以某符号分隔存从根到这的路径. eg: "/1/32/412". 

- 查询后代比较直观: WHERE path LIKE ‘1/4/%’
- 查询祖先比较tricky: WHERE ‘1/4/6/7/’ LIKE path || ‘%’;  一波反向like.\
- 查询上一级的父节点可能要split一下, 查询直接一级的子节点借助外力实现吧.
- 移动子树动用replace函数.
- 插入节点, 存下path即可.

这个方案的效率主要是利用了字符串类型的列 对左侧确定的like查询 会用上索引. 

缺点在于多一个字符串类型的列, 存储消耗变大. 

这个方案也不复杂, 写出来都懂, 但反向like操作很骚.

这个方案的一些变种: 

- 配合邻接表一起用, 也存上parent和level;
- 不用分隔符拼接path, 而是path上每一级存一列, 无限深度的树没法用

---
# Nested Sets

加两列编码左值右值, 就是两个没什么业务含义的数. 一个节点的左值比父节点左值大, 右值比父节点右值小; 换句话说, 父节点的左右值, 把自己所有后代的左右值包含在里面.

如图所示:

![Nested Sets](/resources/treeinrdb/nested_set.png)

整个编码看起来就像是对树的一次后序遍历. 这么编码之后的好处:

- 查询后代: join on: descendant.nsleft BETWEEN me.nsleft AND me.nsright
- 查询祖先: join on: me.nsleft BETWEEN ancestor.nsleft AND ancestor.nsright 
  
  翻译成白话就是: 就是说我的值(左值或右值) 在你的左右值之间, 我就是你的后代. 这个的效率就很可观了
- 查询直接的父子节点, Parent of #6 is an ancestor who has no descendant who is also an ancestor of #6.

  翻译成白话就是两个条件`#6的parent 是#6的祖先` 且 `#6的parent 和#6之间没别人`. 具体sql看参考链接中的pdf.
- 移动子树: 疯了.
- 插入节点: 重算很多. 在上图中 `(5)Ollie`节点下插入一个新节点.
  
  那么 `所有右值大于7的节点右值+2` 且 `所有左值大于7的节点左值都加2`. 很鬼畜啊.

查询直接用整型列的索引, 效率更好. 但缺点在于, 难懂, 写完之后接手的人不懂就尬了.

这个方案的一些变种: 

- 使用整型编码太烦了, 上浮点数吧. 1 1.1 1.2 1.21 1.211, 插入新节点的时候别人甚至不用重算.
- matrix encode. 不知道.

---
# Closure Table

加一个表专门存关系(后文叫TreePaths表). 两列ancestor和descendant, 存入所有的上下级关系. 如图每条线都是该表的一行. 大概需要O(n2)行, 实际不会那么多.

![Nested Sets](/resources/treeinrdb/closure_table.png)

查询:
- 查询祖先: 真是简单. join一下两个表.
- 查询后代: 真是简单. join一下两个表.
- 查询直接的父子节点: 额外列.
- 移动子树: 那么多条path连着呢, 几乎不可行啊
- 插入节点: 需要在TreePaths插入很多行: 新节点的父级的祖先节点的行.

这个方案理解起来尚可. 都是外键效率高, 需要额外一张表的存储空间.

这个方案的一些变种: 

- 加一个lenth存每一条线的长度.

---
# 总结

![Nested Sets](/resources/treeinrdb/compare.png)


---
# 一波好玩的测试数据

研究这个问题时发现一个叫[ITIS]((https://itis.gov/downloads/))的网站, 有一些生物分类的数据库可以下载. 有万级十万级的树状数据. 用django写个api, 用echart画了个图.

![Nested Sets](/resources/treeinrdb/itis.png)

---
# 参考

- [Stack Overflow问题](https://stackoverflow.com/questions/4048151/what-are-the-options-for-storing-hierarchical-data-in-a-relational-database). 很丰富.
- [percona大神的ppt](https://www.slideshare.net/billkarwin/models-for-hierarchical-data). 著有<<SQL反模式>>.本文等同于对这个ppt的翻译.

---
# 后续

遇到需要使用LDAP的情形, 调研时发现LDAP的场景就是一个这样的场景, 忽然意识到这应该叫做 层次模型, 对于层次模型, 按理说更应该使用基于层次模型的数据库, 但比较少见...