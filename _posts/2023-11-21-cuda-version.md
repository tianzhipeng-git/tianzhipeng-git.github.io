---
layout: post
title: "cuda模块关系和版本兼容性"
date: 2023-11-21 23:23:23
categories: ml
tags: ml cuda nvidia pytorch
keywords: Spark执行优化 spark limit
excerpt: cuda兼容性 nvidia-smi nvcc cuda-driver cuda-runtime
comments: true
---
cuda版本和驱动版本搞不清楚, runtime和driver啥区别, nvidia-smi和nvcc版本不一致, 各个组件啥关系, 兼容性怎么支持的

最近升级GPU驱动的时候遇到的问题, 整理记录了一下.

* TOC
{:toc}

# 架构分层
根据官网: 
> CUDA® is a parallel computing platform and programming model developed by NVIDIA for general computing on graphical processing units (GPUs). With CUDA, developers are able to dramatically speed up computing applications by harnessing the power of GPUs.

> CUDA® 是 NVIDIA 开发的并行计算平台和编程模型，用于图形处理单元 (GPU) 上的通用计算。借助 CUDA，开发人员能够利用 GPU 的强大功能来显着加快计算应用程序的速度。

但是cuda相关的组件和概念特别多, 对于新接触的人不太友好, 这里引用[cuda博客](https://blogs.nvidia.com/blog/what-is-cuda-2/)中一张图片:

<img src="/resources/cuda_version/1.jpg" width="500" alt="1"/>

这个图是几年前的了,  而且没体现出我关心的driver/runtime之类的概念, 所以我重新根据目前情况画了一个图

<img src="/resources/cuda_version/2.png" width="700" alt="1"/>

# 各个组件
接下来从下往上介绍一下上图中的各个组件, 列了一些下载安装/查看版本的方式.

## 硬件和os
整套组件要想跑起来的最低层, 就是要有合适的硬件, 合适的操作系统.

查看os和gcc版本:
- `cat /etc/*release`
- `gcc --version`

gcc如果版本过低, 可以采用如下方式升级:
- [源码安装](https://www.cnblogs.com/wulinn/p/13427097.html)
- [yum升级](https://www.jianshu.com/p/6e4da4e246a8)

GPU卡:
- 查看GPU卡: `lspci | grep -i nvidia`  
- [GPU Compute Capability概念](https://developer.nvidia.com/cuda-gpus)


## driver
驱动是软件和硬件交互的一层, 可以通过`nvidia-smi` 查看显卡的驱动情况

```
> nvidia-smi
Mon Nov 20 18:09:16 2023       
+-----------------------------------------------------------------------------+
| NVIDIA-SMI 510.108.03   Driver Version: 510.108.03   CUDA Version: 11.6     |
|-------------------------------+----------------------+----------------------+
| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
|                               |                      |               MIG M. |
|===============================+======================+======================|
|   0  NVIDIA A800-SXM...  Off  | 00000000:10:00.0 Off |                    0 |
| N/A   31C    P0    59W / 400W |      0MiB / 81920MiB |      0%      Default |
|                               |                      |             Disabled |
+-------------------------------+----------------------+----------------------+
...
```

这里可以看出驱动的版本是`510.108.03`, 需要注意的是, 这个上面显示了一个`CUDA Version: 11.6`. 很多资料都没有说清楚nvidia-smi显示的cuda版本是什么意思, 这个绝对不是机器上cuda toolkit的版本, 而是`cuda user-mode driver`的版本! 本质还属于driver的范畴, 在[这篇stackoverflow](https://stackoverflow.com/a/53504578/5142886)中解释的最清楚, 后文我还会提到.

有一个文章提到nvidia-smi显示的cuda版本是能支持的最大cuda版本, 不准确但也没问题, 因为driver是完全向后兼容的, 见后文


对于nvidia卡的驱动, 有如下安装方式:

- [卡对应的driver版本, runfile下载安装](https://www.nvidia.com/download/index.aspx?lang=en-us)
  
    这个页面里选择卡然后是选择cuda toolkit版本而不是driver版本, 官方有意淡化这个概念? 选了cuda版本之后, 弹出的

    下载文件其实还是driver-510.run这样的跟toolkit版本无关的driver文件.
    
- [yum/rpm安装](https://docs.nvidia.com/cuda/cuda-installation-guide-linux/index.html#driver-installation)
  
    上述rpm安装, 可以看出是cuda安装附带了driver的安装, 但是两者是分开的.

    [另见quickstart](https://docs.nvidia.com/cuda/cuda-quick-start-guide/index.html#rpm-installer)

    (cuda-drivers的包 和 yum install nvidia-driver-x 的区别? TODO)
    
    
#### kernel modules
{:.no_toc}
驱动要生效, 好像是要向内核加入一些kernel module的, 这也是安装之后需要重启的原因.

The NVIDIA Linux GPU Driver contains several kernel modules:
```
nvidia.ko
nvidia-modeset.ko
nvidia-uvm.ko
nvidia-drm.ko
nvidia-peermem.ko
```

## cuda
cuda是一套东西, 包含内容分为三类:
- cuda runtime, 即运行时, cudart, 和driver交互的一层吧, 比较重要&单独提出
- [各种库](https://developer.nvidia.com/gpu-accelerated-libraries) 编写各类应用所需的东西, 机器学习加速的东西等等
- [各种工具](https://developer.nvidia.com/tools-overview) 开发工具, 调试工具, 分析测试工具等等

### cuda版本号

<img src="/resources/cuda_version/3.png" width="500" alt="1"/>

图中这3个蓝色框, 各有各的版本号....

前文nvidia-smi显示了两个版本号

使用`nvcc -V`会显示一个版本号
```
nvcc -V
nvcc: NVIDIA (R) Cuda compiler driver
Copyright (c) 2005-2022 NVIDIA Corporation
Built on Tue_Mar__8_18:18:20_PST_2022
Cuda compilation tools, release 11.6, V11.6.124
Build cuda_11.6.r11.6/compiler.31057947_0
```

这3个版本号就是图中3个蓝色框的版本号.
- nvidia-smi显示的`510.108.03` 是最下面`GPU kernal-mode driver (nvidia.so)`的版本
- nvidia-smi显示的`11.6` 是中间`CUDA user-mode driver (libcuda.so)`的版本
- nvcc显示的`11.6` 是最上面`cuda toolkit`的版本

核心疑问在于`CUDA user-mode driver (libcuda.so)`, 他名叫libcuda, 而且版本号是11/12这种数字, 但是却不是和cuda toolkit强关联的. 他属于driver层, 是随着driver一起安装的.
- 在[这篇stackoverflow](https://stackoverflow.com/a/53504578/5142886)中解释的最清楚
- [这个页面](https://docs.nvidia.com/deploy/cuda-compatibility/index.html#conclusion)提到的 "The driver package includes both the user mode CUDA driver (libcuda.so) and kernel mode components necessary to run the application."
- 在服务上找到的libcuda.so文件所在目录是`/usr/lib64/libcuda.so`而不在`/usr/local/cuda-11.6/lib64/`下面

>  另外一个小tip, 根据[cuda release文档](https://docs.nvidia.com/cuda/cuda-toolkit-release-notes/index.html#cuda-toolkit-major-component-versions)中说的, 从CUDA 11开始, cuda中各个小组件的版本开始独立了, 目前来说nvcc和`CUDA Runtime (cudart)`版本号还是一致的, 未来可能不一定咯

### 下载安装

https://developer.nvidia.com/cuda-downloads

两种发布包: 

- distribution-specific packages (RPM and Deb packages) 见下
- [a distribution-independent package (runfile packages)] (https://docs.nvidia.com/cuda/cuda-installation-guide-linux/index.html#runfile-installation)

rpm有多种包: 
- [meta-packages](https://docs.nvidia.com/cuda/cuda-installation-guide-linux/index.html#meta-packages)
- 有的包带着driver驱动?  [是的](https://docs.nvidia.com/cuda/cuda-quick-start-guide/index.html#linux)
  

安装时是否需要卸载老版本?  [根据安装方式不一样](https://docs.nvidia.com/cuda/cuda-installation-guide-linux/index.html#handle-conflicting-installation-methods)

安装后跑个样例任务 
    Install a writable copy of the samples from https://github.com/nvidia/cuda-samples, then build and run the nbody sample using the Linux instructions in https://github.com/NVIDIA/cuda-samples/tree/master/Samples/nbody.

### 一机多版本
 TODO

 https://blog.kovalevskyi.com/multiple-version-of-cuda-libraries-on-the-same-machine-b9502d50ae77

 https://stackoverflow.com/questions/53422407/different-cuda-versions-shown-by-nvcc-and-nvidia-smi

 https://discuss.tvm.apache.org/t/solved-incorrect-libcuda-so-when-multiple-versions-of-cuda-exist-problem-and-solution/886
    
 [这个页面](https://docs.nvidia.com/deploy/cuda-compatibility/index.html#conclusion)提到的 "The driver package includes both the user mode CUDA driver (libcuda.so) and kernel mode components necessary to run the application."


 [页面](https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html#versioning-and-compatibility)提到"only one version of the CUDA Driver can be installed at a time on a system", 说CUDA Driver不能多个版本?  前向兼容的文档中也提到了要卸载老的CUDA Driver版本?

 对于runtime, 上述页面提到"All plug-ins and libraries used by an application must use the same version of the CUDA Runtime **unless** they statically link to the Runtime" 意思是可以多个版本, 要静态链接到runtime上

### cuda libraries
像各种cuDNN, CUPTI等库, 有的不是随着cuda toolkit一起安装的, 但是被PyTorch等上层框架和用户使用, 所以得单独安装.

参考各个库的文档安装即可, 安装完一般都位于`/usr/local/cuda-11.6`目录下, 注意修改`LD_LIBRARY_PATH`环境变量

## 应用层

图中再往上, 就是基于CUDA构建的各类算法框架了, 问题也不大, 后面在版本兼容问题再涉及一点.

# 版本兼容
从上面架构图中可以看出, 整套东西分为很多层, 各层之间就存在一些版本兼容性的问题, 上层组件可以看做是基于下层接口开发的应用.

以下是一些比较关键的兼容性界面

- 卡和driver
- nvidia-driver和cuda-toolkit
- cuda和pytorch
- nvlink相关

其他还有一些相关的兼容性问题, 本文没涉及: 
- 一些cuda的算法libraries[(如cuDNN)和cuda toolkit/driver之间的版本兼容性问题](https://docs.nvidia.com/deeplearning/cudnn/support-matrix/index.html)
- 直接基于cuda的C++之类的编写自己的应用, [参考](https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html#compilation-with-nvcc)

## 卡和driver版本兼容
首先我们知道自己机器的GPU卡是什么版本的, 比如A800/A100/V100等, 这些都属于英伟达`Data Center / Tesla`系列的卡. 

在nvidia的[驱动下载页面](https://www.nvidia.com/download/index.aspx?lang=en-us), 选好显卡型号和操作系统等信息, 下拉列表能看到可以选择的cuda tookit版本.

<img src="/resources/cuda_version/4.png" width="500" alt="1"/>

如前面所说, 这里的选的是cuda版本, 实际搜出的是对应版本的driver.

<img src="/resources/cuda_version/5.png" width="500" alt="1"/>

所以根据这个, 就可以知道自己的显卡能安装哪些版本的驱动和cuda了.

## nvidia-driver和cuda-toolkit版本兼容
这是最乱的一个地方, 根据官方文档的介绍研究了好久:

- [关于兼容性的说明](https://docs.nvidia.com/deploy/cuda-compatibility/index.html#conclusio)
- [每个cuda版本发布说明](https://docs.nvidia.com/cuda/cuda-toolkit-release-notes/index.html#)

### 向前向后兼容概念介绍
> - backward compatibility (向后兼容, 回溯兼容) = downward compatibility (向下兼容) = 向过去兼容
>
> ​	即现在设计的软件要考虑旧版本的数据还能不能用，比如在开发Office 2007的时候，要考虑如何打开Office 2003的doc/xls/ppt文件，而不能仅仅只能打开docx/xlsx/pptx文件
>
> - forward compatibility (向前兼容, 前瞻兼容) = upward compatibility (向上兼容) = 向未来兼容
>
> ​	即现在设计的软件要考虑未来还能不能用。比如保留几个字段，留给未来新填写新数据

对于cuda来讲, 每个cuda版本都有他最合适的driver版本, "每个 CUDA 工具包还附带 NVIDIA 显示驱动程序包。该驱动程序支持该版本的 CUDA 工具包中引入的**所有功能**", 相当于是这个cuda版本开发时就根据这个版本driver开发的, 功能上最兼容的一个版本对应关系.

这个最完美的版本对应关系在[release说明中的Table3 CUDA Toolkit and Corresponding Driver Versions](https://docs.nvidia.com/cuda/cuda-toolkit-release-notes/index.html#id5)可以看到.

"通常，升级 CUDA 工具包涉及升级工具包和驱动程序，以获得最先进的工具包和驱动程序功能。"

但是, 如果想在一个比较老的driver上跑比较新的cuda版本, 或则在一个比较新的driver上跑一个比较老的cuda版本, 就涉及兼容性问题了.

以`CUDA 12.0 GA  >=525.60.13`为例, 我们讨论nvidia的driver对于他的上层应用(即cuda), 提供了怎样的兼容性, 也即, 主语是driver.

driver提供三种兼容能力, 下面细说
- Backward Compatibility
- Minor Version Compatibility
- Forward Compatibility



### driver的向后兼容
Backward Compatibility, 这个最好理解, nvidia目前为止保证了, driver的版本不断升级, 都能够兼容以前的旧的cuda和应用, 即完整的向后兼容能力. 

<img src="/resources/cuda_version/6.png" width="500" alt="1"/>

如图, driver`525.60.13`版本, 能支持12.0即之前的所有版本的cuda.

那对于未来的cuda版本, 它也不是说都不支持了, 也就是说也提供了向前兼容的能力, 就是一下两种.

### driver的次要版本兼容
Minor Version Compatibility, 次要版本兼容或者说小版本兼容能力, 是从`CUDA 11`开始提供的功能, 是一种driver可以向前兼容未来的cuda版本的能力. (当然文档中说了, 这种兼容是limited feature-set, 有限功能集, 不是全部功能都能用)

<img src="/resources/cuda_version/7.png" width="600" alt="1"/>

如图, 还是driver`525.60.13`版本为例, 它正对应的版本是12.0, 所谓小版本兼容, 就是未来所有12.x的cuda版本, 都保证能在cuda525上运行, 虽然现在最高是cuda12.3, 未来即使发不了12.8 12.9, 也能在cuda525上跑. 

也就是说所有12.x的小版本, 他们能运行的最低driver版本都是525. 这个次要版本兼容的列表在[release说明中的*Table 2* *CUDA Toolkit and Minimum Required Driver Version for CUDA Minor Version Compatibility*](https://docs.nvidia.com/cuda/cuda-toolkit-release-notes/index.html#id4)

注意, cuda11之前没这个能力, cuda10.x的每个小版本, 对应的最低driver版本是不同的, 升级cuda小版本, 也得跟着升级driver版本, 实惨.

<img src="/resources/cuda_version/8.png" width="600" alt="1"/>

那么在driver525上, cuda13.x之后的cuda版本, 就一定不能在cuda525上跑了么?

#### 两种driver的版本区别呢

之前文档指出, 这里涉及到3个东西的兼容性, 他们从底到上分别是

- GPU kernal-mode driver
- CUDA user-mode driver
- CUDA runtime

讲上面两种兼容性的时候, 为啥没提到中间那个`CUDA user-mode driver`呢?

因为在正常情况下`CUDA user-mode driver`, 是随着`GPU kernal-mode driver`一起安装, 一起升级的, 基本等于绑定.
刚才所谓的driver的向后兼容和小版本兼容能力, 也是`CUDA user-mode driver`能提供的兼容能力, **"the minor-version compatibility that is defined between CUDA runtime and CUDA driver"**, 应用这两种兼容能力时, 两个driver不分家.

比如`CUDA user-mode driver`是12.0版本(kernal driver525对应的), 那么在他上面运行

- 11.x版本的`cuda runtime/cuda toolkit`, 都没问题, 向后兼容.
- 12.3/12.x版本的`cuda runtime/cuda toolkit`

注意前文也提到过`nvidia-smi`中显示的cuda version就是`CUDA user-mode driver`的版本, 所以和nvcc的版本不一致也就可以理解了.



### driver的向前兼容
Forward Compatibility, 当涉及到跨越主要版本(cuda大版本)的兼容情况, 就要用的这个第三项, 真正的Forward Compatibility能力了.

这种兼容能力有一些限定:

- 仅限Data Center系列GPU卡
- 需要安装一种特殊的包called "CUDA compat package", 比如cuda-compat-12-1
  - 这个包除了把cuda runtime/cuda toolkit升级了, 还附带新版本的`CUDA user-mode driver(libcuda.so等文件)`
  - 这些文件会放置在/usr/local/cuda/compat, 需要在LD_LIBRARY_PATH中额外加入这个路径
- 仅限某些版本的driver

也就是说, 要想跨越主要版本(cuda大版本)在老driver上运行, 需要用compat包同时升级cuda toolkit和CUDA user-mode driver, 如图

<img src="/resources/cuda_version/9.png" width="500" alt="1"/>

可以说这种兼容不像前两个那么直接了, 有一些额外操作, 还是要谨慎使用的, 一般适用于driver版本实在没法升级的情况下.

这个Forward Compatibility不像前两个兼容那样, 一下能支持好多版本了, 仅限于表格中列出的这些

<img src="/resources/cuda_version/10.png" width="600" alt="1"/>

注意表中只是表述前向兼容cuda包和各个driver版本的兼容情况, 不代表着普通cuda包在各driver版本上的兼容情况. 

以表中11-3那行为例, 它在表中470.57.02/495.29.05/520.61.05等等所有列, 都显示的X.  但是根据[release note](https://docs.nvidia.com/cuda/cuda-toolkit-release-notes/index.html)中可以看出普通的cuda 11.3版本, 它最合适的driver版本是>=465.19.01, 它的小版本兼容性driver是>=450.80.02, 所以上述470/495之类的, 应该是都兼容的, 不涉及前向兼容.

所以这个表的正确用法是, 看每一列"Not required"往上的部分单元格, 那才是涉及前向兼容的地方. 比如470.57.02那列, 470.57.02这个版本的驱动是跟着cuda11.4一起的, 但是它能兼容12-0到12-3的**cuda compat包**.

> **"forward compatibility is defined between the kernel driver and the CUDA driver"**

文档中关于次要版本兼容和前向兼容的对比:

<img src="/resources/cuda_version/11.png" width="700" alt="1"/>

## tensorflow和cuda版本兼容
根据[文档](https://www.tensorflow.org/install/pip?hl=zh-cn)
TensorFlow 1.x，CPU 和 GPU 软件包是分开的, TensorFlow 2.x就一个统一的包
- tensorflow==1.15：仅支持 CPU 的版本
- tensorflow-gpu==1.15：支持 GPU 的版本（适用于 Ubuntu 和 Windows）

[tf安装说明中的要求](https://www.tensorflow.org/install/gpu?hl=zh-cn):

    NVIDIA® GPU 驱动程序 - CUDA® 11.2 要求 450.80.02 或更高版本。
    CUDA® 工具包：TensorFlow 支持 CUDA® 11.2（TensorFlow 2.5.0 及更高版本）
    CUDA® 工具包附带的 CUPTI。
    cuDNN SDK 8.1.0 cuDNN 版本。
    （可选）TensorRT 6.0，可缩短用某些模型进行推断的延迟时间并提高吞吐量。


能搜到的关于tensorflow和cuda的版本问题, 基本都来自官方文档的这个页面["经过测试的构建配置?"](https://www.tensorflow.org/install/source?hl=zh-cn#gpu)

<img src="/resources/cuda_version/13.png" width="500" alt="1"/>

这个页面说的是从源码构建tensorflow, 其实也不代表着tensorflow能运行的cuda版本吧, 反正没有别的资料了, 大家都按这个来.

以图中tensorflow2.6.0为例, 图中写的是需要cuda11.2
- 就是按照cuda runtime/cuda tookit编译的, 看起来运行也需要11.2及以上了
- 根据[cuda文档](https://docs.nvidia.com/cuda/cuda-toolkit-release-notes/index.html)对应11.2的driver版本最好是>=460.27.03, 最少是>=450.80.02

### tensorflow+docker+gpu

TODO

https://www.tensorflow.org/install/source?hl=zh-cn#gpu_support_3
https://www.tensorflow.org/install/docker?hl=zh-cn
https://github.com/NVIDIA/nvidia-container-toolkit
"Docker 是为 TensorFlow 构建 GPU 支持的最简单方法，因为主机只需安装 NVIDIA® 驱动程序，而不必安装 NVIDIA® CUDA® 工具包。"

<img src="/resources/cuda_version/12.png" width="500" alt="1"/>

nv搞的镜像
https://docs.nvidia.com/deeplearning/frameworks/tensorflow-release-notes/rel-23-10.html



## pytorch和cuda版本兼容

pytorch和cuda的兼容, 和tensorflow不太一样.

首先pytorch的包, 都是对应cuda版本的, 在[start页面](https://pytorch.org/get-started/locally/)选择

<img src="/resources/cuda_version/14.png" width="500" alt="1"/>

根据这两篇[帖子1](https://discuss.pytorch.org/t/would-pytorch-for-cuda-11-6-work-when-cuda-is-actually-12-0/169569), [帖子2](https://discuss.pytorch.org/t/is-cuda-back-compatible/76872/2)中用户ptrblck的说法
- local CUDA installation won’t be used, but instead the one shipped with the binaries.
  
    torch中不会使用本地安装的cuda 而是用**shipped with the binaries**, 即torch包本身自带的cuda

-  PyTorch binaries ship with their own CUDA runtime (as well as other CUDA libs such as cuBLAS, cuDNN, NCCL, etc.). The locally installed CUDA toolkit (12.0 in your case) will only be used if you are building PyTorch from source or a custom CUDA extension.
   
    PyTorch 二进制文件附带了自己的 CUDA 运行时（以及其他 CUDA 库，例如 cuBLAS、cuDNN、NCCL 等）。仅当您从源代码或自定义 CUDA 扩展构建 PyTorch 时，才会使用本地安装的 CUDA 工具包（在您的情况下为 12.0）

尝试在pytorch安装目录里找到libcudart.so, 没找到, 但是有其他文件, 应该是包含了cuda吧:

```
[tzp@gpu07 torch]$ find . -name "*.so"
./lib/libc10.so
./lib/libc10_cuda.so
./lib/libcaffe2_nvrtc.so
./lib/libshm.so
./lib/libtorch.so
./lib/libtorch_cpu.so
./lib/libtorch_cuda.so
./lib/libtorch_cuda_cpp.so
./lib/libtorch_cuda_cu.so
./lib/libtorch_cuda_linalg.so
./lib/libtorch_global_deps.so
./lib/libtorch_python.so
./_C.cpython-39-x86_64-linux-gnu.so
./_C_flatbuffer.cpython-39-x86_64-linux-gnu.so
./_dl.cpython-39-x86_64-linux-gnu.so
```



所以torch安装起来直接考虑所安装的torch附带的cuda版本 , 如`torch-1.12.0+cu116-cp39`, 和机器的driver是否兼容即可




# 参考
- [nvidia文档-关于兼容性的说明](https://docs.nvidia.com/deploy/cuda-compatibility/index.html#conclusio)
- [nvidia文档-每个cuda版本发布说明](https://docs.nvidia.com/cuda/cuda-toolkit-release-notes/index.html#)
- [nvidia文档-c开发最佳实践](https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html#cuda-compatibility-developer-s-guide)
- [nvidia文档-c开发指南](https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html#versioning-and-compatibility)
- [nvidia文档-cuda安装指南] (https://docs.nvidia.com/cuda/cuda-installation-guide-linux/index.html#runfile-installation)
- [nvidia驱动下载](https://developer.nvidia.com/cuda-downloads)
- [tensorflow经过测试的构建配置?](https://www.tensorflow.org/install/source?hl=zh-cn#gpu)
- [pytorch论坛-帖子1](https://discuss.pytorch.org/t/would-pytorch-for-cuda-11-6-work-when-cuda-is-actually-12-0/169569)
- [pytorch论坛-帖子2](https://discuss.pytorch.org/t/is-cuda-back-compatible/76872/2)
- [一篇stackoverflow](https://stackoverflow.com/a/53504578/5142886)
- [博客-Linux 调度（GPU）虚拟化](https://www.sohu.com/a/493138400_121124360)
- [博客-centos下tensorflow-gpu2.4.1安装](https://blog.csdn.net/qq_37721614/article/details/125618000)


# nvlink相关
TODO