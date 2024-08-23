---
layout: post
title: "MLOps各种架构图"
date: 2023-11-21 23:23:23
categories: "algo&ml"
tags: ml mlops
keywords: MLOps架构图 MLOps组件 MLOps概念
excerpt: MLOps架构图 MLOps组件 MLOps概念
comments: true
---
最近一直做模型工程方向的工作, 调研了很多MLOps相关的东西, 读了几本MLOps相关的书籍, 这里简单整理一些觉得不错的MLOps相关的模块功能图/架构图, 基本上是概念层面的, 可以帮助快速了解这个领域.

全是图片!

* TOC
{:toc}

# Hidden technical debt in Machine learning systems
<img src="/resources/mlops_arch/1.png" width="700" alt="1"/>

谷歌论文, 机器学习系统中隐藏的技术债务, 提到ml code只占机器学习系统的一小部分, 周边基础设施复杂庞大.

# Neptune.ai
neptune.ai是一家商业版mlops平台提供商, 他有两篇很好的博客介绍了MLOps相关概念.

### [1. MLOps: What It Is, Why It Matters, and How to Implement It](https://neptune.ai/blog/mlops)
{:.no_toc}

<img src="/resources/mlops_arch/2.webp" width="800" alt="1"/>

他将MLOps分成三个阶段: 数据准备, 模型构建, 发布上线.

[博客中引用了Google描述的"三个级别的 MLOps"](https://cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning?hl=zh-cn):
- MLOps level 0 (Manual process)
- MLOps level 1 (ML pipeline automation)
- MLOps level 2 (CI/CD pipeline automation)

### [2. MLOps Architecture Guide](https://neptune.ai/blog/mlops-architecture-guide)
{:.no_toc}

<img src="/resources/mlops_arch/3.webp" width="800" alt="1"/>

# Metaflow
Metaflow也是一个MLOps平台, 有收费有开源版本, 它文档中从算法建模过程逐级的分析出MLOps所需要的架构, 我将他制作成动图:

<img src="/resources/mlops_arch/6.gif" width="800" alt="1"/>

- 数据
- 计算
- 协调(调度)
- 版本
- 部署
- 建模

# <<Introducing MLOps>>

<img src="/resources/mlops_arch/4.jpg" width="400" alt="1"/>

这本书介绍了MLOps全过程的阶段, 和各个阶段要做的事情, 也算是概述性质的, 当然书中描述的还是比一些博客更细节, 阐述了每个阶段更细力度的工作内容和工作产出, 我整理成一个更好看一点的图.

<img src="/resources/mlops_arch/5.png" width="950" alt="1"/>

分为四个阶段:
- 建立模型
- 生产准备
- 部署上线
- 监控反馈



# <<Practical MLOps>>
这本书偏向入门实践, 基于python和一些云平台构建MLOps的流程的示例都有.

书中提出的一个关键问题在于, 实施MLOps的前提是, 满足了基础设施, DevOps, 数据管线自动化等等基础需求, 这个需求是分层次的, 连DevOps都没实现, 数据也没自动化, 无从谈起MLOps. 书中借助马斯洛的需求层级理论来说明这一点:

<img src="/resources/mlops_arch/7.png" width="700" alt="1"/>

这个很有道理, 有一些基础的需求还没满足的情况下, 整那些高级功能有啥用?

## SageMaker
书中管理AWS SageMaker的架构图不错, 都保存了.

SageMaker MLOps整体架构:

<img src="/resources/mlops_arch/8.png" width="550" alt="1"/>

SageMaker MLOps容器部署:

<img src="/resources/mlops_arch/9.png" width="550" alt="1"/>

SageMaker MLOps模型监控:

<img src="/resources/mlops_arch/10.png" width="550" alt="1"/>

# 其他
还有一些觉得不错的东西
## 知乎博客
### [一个quant大佬](https://zhuanlan.zhihu.com/p/136245887)
{:.no_toc}

<img src="/resources/mlops_arch/11.jpg" width="550" alt="1"/>
### [Google MLOps白皮书（上）|MLOps生命周期及核心能力](https://zhuanlan.zhihu.com/p/557745130)
{:.no_toc}
### [Google MLOps白皮书（下）|MLOps过程的深入研究](https://zhuanlan.zhihu.com/p/560282867)
{:.no_toc}

## Kubeflow