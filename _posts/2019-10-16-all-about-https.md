---
layout: post
title: "理解https原理&TLS1.3"
date: 2019-10-16 23:23:23
categories: network
tags: http web presentation
comments: true
---

之前总以为自己了解https了, 然而遇到问题总蒙圈. 这次证书踩坑了, 借机整理一下.

* TOC
{:toc}

# Why TLS目标

Https中的'S'就是TLS(SSL是TLS的前身, 已废弃), Transport Layer Security传输层安全协议, 所以本文主要是整理TLS相关的内容. TLS顾名思义是为传输层提供安全性的, 是位于应用层(HTTP))和传输层(TCP)之间的一层协议. 当然不只是用于https中, 比如我们和mysql数据库建立连接时, 也可以使用TLS加密. 

TLS提供的安全包括:  
- `防窃听(eavesdropping)`, 对应`加密(Confidentiality)`
- `防篡改(tampering)`, 对应`完整性校验(Integrity)`
- `防伪造(forgery)`, 对应`认证过程(Authentication)`

等等还有一些其他安全特性. TLS要能保证即使整个中间网络都被控制的情况下, Client和Server的端到端通信的安全, 决不允许中间商赚差价!

# How TLS原理

## 预备知识

在具体讲TLS过程之前, 提一下三类算法, 在后面TLS协议中都要用到(其实TLS1.2需要五类算法?).

- 哈希算法, 或称为摘要算法. 如SHA
- 对称加密算法, 使用相同的密钥进行加密和解密. 速度较快. 如AES算法
- 非对称加密算法, 主要是公私钥的方式. 速度比对称加密慢很多, 好处是公钥可以开放给任何人. 如RSA算法

学习Web相关知识, 有时间的还是要看RFC文档. 比如本文大部分内容都来自RFC8846, TLS 1.3版本.

本文中各种技术概念缩写, 不认识的参考倒数第二小节内容.

文中使用wireshark抓包分析, [样例pcap文件在此](/resources/tls/tls3.pcapng), 然后我把包内容转成json了方便查看, 下面的json都是可折叠展开的!

### 土味密码学

接着我们回想一个土味加密故事, 通信的双方都弄一本大书比如<<史记>>:

- A要发送消息的时候, 将原始内容"你好啊", 通过史记, 加密为"p1l20c3;p3l32c4;p45l23c2"(也就是书的第几页第几行第几个字了)
- B接到密文狂翻书把消息解密
- 其他中间人, 即使截获了密文, 如果他不知道加密方法, 或手头没有史记, 就没法解开原消息

很多其他的加密方法, 也都需要'史记'这样一种东西, 可以叫做`shared key`, 像是公私钥, 随机数之类的东西. 我这里编造一些数学语言: 原始消息m, 加密参数p; 加密时, 密文em = f(m, p); 解密时 m = f'(em, p'). 

加密算法好不好, 可能就取决于函数f和参数p是否容易被人破解, 对于函数f的选取, 很多加密算法都利用的是一些数学上难解的问题, 比如因数分解(RSA), 椭圆曲线问题(ECC)等等. 

(加密的好坏一定不是取决于我想到一个加密方法不告诉别人就很安全, 而是我把我的加密方法公开, 但是你没有我的密钥你就是解不开)

(PS.密码学真的是数学家搞的玩意啊, 涉及军事的东西, 投入了多少人力物力无法想象. 下图为椭圆曲线问题动图)

![ec-demo](/resources/tls/ec-demo.gif)

对于加密参数, 需要考虑的则是, 如果两个人预先没有通信过, 怎么沟通一个互相知道的参数p?

> TLS整个加密过程大体分两步: 用某种方法沟通某种加密用的key, 然后用这个key进行后续内容的加密通信. 这两步就对应着TLS下的两个子协议: 握手协议和记录协议. 

> 由于前面提到的对称和非对称加密的速度问题, 所以TLS都是在握手阶段使用非对称加密沟通, 通信阶段使用对称加密.

## Handshake握手协议

握手协议用于协商协议版本, 认证通信的参与方, 协商加密模式/算法/参数, 建立共享的加密材料.


### 交换密钥
目前(TLS1.3)只支持三种密钥交换模式:
-  (EC)DHE
-  PSK-only
-  PSK with (EC)DHE   (比第二个的好处是前向安全)

(1.3废弃了之前的[静态RSA密钥交换](http://www.ruanyifeng.com/blog/2014/09/illustration-ssl.html)方法)

(Pre-shared key, 预先共享的密钥, 一般是out-of-band的, 比如把密钥微信发你了这种, 或者是之前咱俩TLS握手成功过, 保存了session ticket. **下文都不讨论这种模式, 只说DHE的**)

这里我们重点讨论DH密钥交换算法(Diffie-Hellman), 假设我们需要找到一个函数f满足如下两个性质:
1. 知道f和f(a), 没法很容易推导出a
2. g(f(a), b) == g(f(b), a)

如图:
<img alt="DH" src="/resources/tls/dh.png" width="600"/>

p是一个超大的质数, g是p的一个[原根](https://zh.wikipedia.org/wiki/%E5%8E%9F%E6%A0%B9). 这里这个函数就满足刚才说的那两个特性, 这个称为离散对数问题, 没有高效的破解方案.

有了这两个特性, Server和Client就可以在不安全的网络上, 放心的公开`函数f`, `f(a)`(和RSA公私钥效果是一样的, 可以称为公钥), `f(b)`, 然后双方计算出相同的K来, 就达成了安全的交换一个共享密钥的目的.

> 到这里其实还有个问题是, 和你交换密钥的对方, 是不是你以为的那个人? 比如被DNS污染了, 和你通信的不是真的银行的服务器怎么办?

### 身份认证

认证身份并不是"天王盖地虎, 小鸡炖蘑菇"这种对对暗号这么简单, 这里使用的是数字证书体系PKI. 

(一般server端必须认证, client端很少认证: 比如银行给你一个USB, 里面可能就有客户端证书做认证的).

证书就是证明身份的一份文件, 它声明了:
1. 域名(就是证书要保护的资源, 在Https里我们要保护域名))
3. 拥有者信息
4. 颁发者信息
2. 拥有者公钥
3. 签名
4. 有效期

<img alt="DH" src="/resources/tls/cer-verify.png" width="900"/>



### 协议流程和格式
标准的握手过程如图, 只用1-RTT, 三步:

<img alt="1-RTT, 三步" src="/resources/tls/f1.png" width="600"/>

下图是wireshark随便抓了一个最简单的握手过程:
![handshake.png](/resources/tls/handshake.png)
下面照着这个图讲一下各个消息:

1. client先打个招呼, `client-hello`: 向服务器表示, 我有什么, 我能支持什么.(最终怎么做由服务器决定)
      <div id="client-hello"></div>

      我们可以重点关注一下几个:
      1. a random nonce. 临时随机数.
      2. protocol versions. 支持的协议版本列表.
      3. **a list of symmetric cipher/HKDF hash pairs**
      4. **a set of Diffie-Hellman key shares (in the "key_share" (Section 4.2.8) extension)**
      6. **some potentially additional extensions.(如支持哪些EC椭圆曲线组, 支持哪些签名算法)**

      TLS1.3中, 各种算法可选项都是'正交的', 即有`a*b*c`种组合(这些组合是安全的, 不安全的都废弃掉了).


2. server端也回复一句`server hello`: 
      <div id="server-hello"></div>

      server端根据客户端支持的版本, 算法等等参数, 再结合自己支持的情况, 做出选择, 将结果返回给client端.

      除了server_hello, server端根据情况还要发送:
      - [EncryptedExtensions](https://tools.ietf.org/html/rfc8446#section-4.3)
      加密要用到的参数(required to establish the cryptographic context and negotiate the protocol version)放在server_hello里, 用不到的放这里, 这里是加密的.

      - [CertificateRequest](https://tools.ietf.org/html/rfc8446#section-4.3.2) 需要认证client端时发送.

3. server端发送自己身份认证信息`Certificate + CertificateVerify + Finished`
      <div id="cer"></div>

      - `Certificate消息`: 就是证书, 如果需要则是多个证书的证书链, 一般是用X509定义的证书格式.
      - `CertificateVerify消息`: A signature over the value Transcript-Hash(Handshake Context, Certificate)
      - `Finished消息`: [没什么别的事就Finished吧](https://tools.ietf.org/html/rfc8446#section-4.4.4), 作为整个握手过程的最后一条消息. A MAC over the value Transcript-Hash(Handshake Context,Certificate, CertificateVerify)

      关于[证书格式可以参考这篇文章](https://www.cnblogs.com/guogangj/p/4118605.html), 这里提一下, X.509的证书的文件格式只有两种, `二进制的der`和`base64编码的文本的pem`, 无论你得到的证书后缀名是什么, 根据内容是否是文本即可判断.





## Record记录协议

使用上一步建立的加密参数, 给后续应用层数据传输加密. 过程比较简单, 就是在数据上应用由`ciper suite`指定的AEAD算法进行加密和校验完整性.

(而且应用数据加密和之前握手加密用的密钥是不同的, 从wireshark也没解开. 主要是没时间弄了, 这一个part就这样吧)

# Practice实践

## 证书踩的坑

[证书格式. x509](https://tools.ietf.org/html/rfc5280)

为某服务在Nginx配置了证书, 经浏览器打开没问题就对外使用了, 但是使用方反馈请求会报错`Peer's Certificate issuer is not recognized`

当时没有深入研究, 以为是因为这个证书的颁发者不行, 后来发现别的用这个证书的服务没有这个问题. 一顿折腾最终发现原因是我没有把`中间CA`加入证书文件里, 没有组成证书链.

一开始也疑问证书链要不要全放在文件里, 现在看来是需要的. 没有配置好证书链, 为什么浏览器能正常用呢? 
仔细思考一下原因可能是: 
1. 浏览器可以缓存他认证过的机构和证书
2. 浏览器可以访问外部网络认证他不认识的证书

而从`curl`或者`java ssl lib`的角度看, 他只能从本地keystore里进行认证, 链不全就是没法验证. 

## 工具用法
可以用`openssl/wireshark/ncat`等工具查看TLS相关信息, 下面贴一些我们用过的命令:

{% highlight bash %}
openssl ciphers -v | column -t #列出当前openssl支持的ciper suite列表
openssl s_client  -no_ticket  -connect baidu.com:443 #作为TLS客户端建立连接
openssl version -d #查看本地信任的CA的证书位置
bopenssl s_client  -no_ticket  -connect www.baidu.com:443 -keylogfile=/Users/tzp/data/cer/sslkeylogfile #保存握手秘钥到文件, wireshark解包时用

#[接下来几步生成一对公私钥和自签名的证书](https://www.jianshu.com/p/81dbcde4fd7c)
openssl genrsa -out bd.key 2048 #生成私钥
openssl req -new -key bd.key -out bd.csr #生成证书请求文件
openssl x509 -req -signkey ~/.ssh/id_rsa -in bd.csr -out bd.crt.pem #使用私钥 签发一个csr 自签名
openssl x509 -in bd.crt.pem -text #查看证书详细信息, 这个命令也可转化其他输入输出格式

tshark -r tls3.pcapng -T json -J tls --no-duplicate-keys > tls3.json
{% endhighlight %}


## wireshark抓包踩的坑
下图是我抓的包:

<img alt="DH" src="/resources/tls/tls3unseal.png" width="600"/>

内心OS: 
- Hello之后直接change_cipher_spec, 然后就发送应用数据了?!
- 没有Certificate? 不认证了么?!
- 说好的The Finished message is always sent as part of the Authentication Block, 也没有了?
- 使不使用PSK都一样的流程, 还以为是psk或者session导致的没有认证, 后来发现不是啊, 没用psk, session废弃了.

答案: hello之后的握手消息都加密了, wireshark解不出来, 而且消息的类型字段设计的竟然是application_data(23)这个值!! 后来参考[这篇文章](https://www.jianshu.com/p/9b34d2bbcb9f/)解密才能看到明文的握手.

# 各种概念缩写和本文略去的内容

- [EC(DHE)](https://en.wikipedia.org/wiki/Elliptic-curve_Diffie%E2%80%93Hellman): Elliptic curve椭圆曲线 Diffie–Hellman密钥交换算法 Ephemeral临时的. 组合起来就是使用椭圆曲线的DH临时密钥交换算法.
- [HKDF](https://en.wikipedia.org/wiki/HKDF): Hash based Key derived funciton, 基于哈希的密钥派生函数. 所谓密钥派生是指, 应用初始的密钥材料派生出一个或多个安全强度很大的密钥.
- [PSK](https://en.wikipedia.org/wiki/Pre-shared_key): Pre-shared key, 预先共享的密钥, 一般是out-of-band的, 比如把密钥微信发你了?
- Session, TLS握手session, 协议中"session IDs", "session tickets"等字段的存在, 在再次连接时就不用走完整的握手过程了
- 前向安全性(Forward Secrecy): 指在长期密钥被破解时确保会话密钥的完整性。PFS（完备的前向安全性）是指强制在每个/每次会话中推导新的密钥。这就是说, 泄露的私钥并不能用来解密(之前)记录下来的加密通讯记录
- [AEAD](https://en.wikipedia.org/wiki/Authenticated_encryption): authenticated encryption with associated data带关联数据的经认证的加密.
- IV: 初始向量Initialization Vector
- [块加密(block cipher) vs](https://crypto.stackexchange.com/questions/5333/difference-between-stream-cipher-and-block-cipher) 流式加密(stream cipher). 在对称加密范围内, 可以分为块加密和流加密. (非对称加密都是by块进行加密的, 不讨论)
- [CBC](https://en.wikipedia.org/wiki/Block_cipher_mode_of_operation): 块加密不能直接用, 需要选取一种分块的模式. Cipher Block Chaining密码块链模式
- [GCM](https://en.wikipedia.org/wiki/Galois/Counter_Mode): Galois/Counter Mode, 另一种块加密的模式
- Cipher Suite: 加密套件, 例如TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384, 中间的各个缩写上面都提到了.1.2和1.3用途不同.
- [PKI](https://en.wikipedia.org/wiki/Public_key_infrastructure): public key infrastructure, 公钥基础设施, 是指管理数字证书体系的各种配套的软件/硬件/组织/流程等.
- [CA](https://en.wikipedia.org/wiki/Certificate_authority){:target="_blank"}: Certificate Authority, PKI中负责颁发和认证证书的组织
- OCSP: Online Certificate Status Protocol, 在线证书状态协议
- PRF: pseudorandom function



## TLS 1.2和1.3 版本区别

这是RFC中列出的区别:
1. 对称加密算法删减了, 只保留AEAD套件(把Encrypt加密过程和MAC完整性校验过程二合一了).
2. 新增0-RTT模式
3. 静态RSA和DF加密套件被移除, 现在所有支持的公钥加密都是前向安全的了
4. SeverHello之后的所有握手消息都是加密的了(原来整个握手过程不加密, 到记录协议才加密)
5. 重新注册了KDF函数
6. 握手状态机重构
7. 椭圆曲线算法和EdDSA等新算法引入基本协议
8. 其他密码学提升
9. 版本协商状态机废弃(原来通过version字段判断, 现在这个字段固定为1.2, 通过support_version扩展字段来判断)
10. Session恢复过程被PSK交换模式替代


TLS已经广泛运行十多年了, 有太多中间软件支持1.2版本, 而1.3不兼容1.2. 为了增加一些互操作性(即1.2的软件看到1.3的包不至于懵逼), 1.3在协议格式上做了很多妥协:

报文伪装成1.2的样子, 你要是支持1.3你就懂的这是1.3的, 你要是不懂1.3, 就按1.2的逻辑处理. 如:
- version字段保持1.2, 要support扩展判断
- hello之后的握手消息的类型竟然是application_data(23)
- 一直发[奇怪的change_cipher_spec消息](https://tools.ietf.org/html/rfc8446#appendix-D.4)
- [cipher_suite字段还在使用, 但是含义有了区别](https://tools.ietf.org/html/rfc8446#appendix-B.4), 1.3的cipher_suite只指定了AEAD和HKDF算法, 1.2的cipher_suite指定了更多东西, 两个版本的互相不能通用

整体上讲, 握手过程和加密套件都精简了很多, 选择越少, 可犯错的机会就越少.

把国内大厂的首页看了一圈, 只有养猪场的首页支持TLS1.3, /滑稽


# 参考资源
本来想基于历史上出现的漏洞来分析TLS协议的更新过程和目的, 这样才能更好的了解为什么协议这样设计/这样更改. 但是水平和时间有限啊.

- [超全的一篇博客, 本文写到一半时看到它, 瞬间不想写自己的了, 不过它是基于TLS1.2写的, 本文1.3](https://www.cnblogs.com/thammer/p/7654925.html)
- [RFC8446: TLS 1.3](https://tools.ietf.org/html/rfc8446); (前三个版本的RFC是2246, 4346, 5246)
- [RFC5280: X.509](https://tools.ietf.org/html/rfc5280)
- [RFC7468: PEM](https://tools.ietf.org/html/rfc7468)
- [RFC4492: ECC for TLS](https://tools.ietf.org/html/rfc4492)
- [逐字节分析TLS协议](https://tls13.ulfheim.net/)
- [TLS 1.3介绍和1.2的区别](https://www.oschina.net/translate/rfc-8446-aka-tls-1-3?lang=chs&p=2)




<script src="/resources/tls/data.js"></script>
<div id="character-noncount" style="display: none;">22200</div>