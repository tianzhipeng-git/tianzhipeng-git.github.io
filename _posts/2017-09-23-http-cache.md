---
layout: post
title: "HTTP浏览器缓存机制介绍"
date: 2017-09-22 16:23:32
categories: network
tags: http cache web rfc presentation
comments: true
---

这是前端时间做的一次分享, 起因是我们的网站在更新的时候若js等有变动, 需要用户强刷才能获取最新内容, 借这个机会了解了HTTP浏览器缓存的机制. 本文的主要内容基本上取自RFC-7234, 翻译整理加自己的理解, 加上一些其他资料和图片.

* TOC
{:toc}

## 提出问题
- 为什么要清除缓存/强刷?
  - 简单说原因就是因为浏览器缓存了旧版本的文件, 在打开页面时直接使用缓存, 没有向服务器发起对 新部署上的文件的请求, 所以需要强刷.
- 为什么要缓存? 
  - HTTP缓存的设计 一是为了节省带宽流量资源. 二是为了减少浏览器打开页面的响应时间.
- 如何做的缓存? 后文解答
- 强刷是什么? 后文解答

## 划清范围
本文中"缓存"一词, 特指在HTTP协议相关的, 出现在浏览器, 中间代理服务器上的, 对于HTTP响应消息的缓存, 不涉及其他的如网关层,CDN,后端负载均衡等处的缓存.

HTTP缓存, 从类型上分两种shared cache / private cache, 前者可被中间代理和浏览器缓存,后者只能被浏览器缓存.

![缓存类型](/resources/httpcache/HTTPCachtType.png)

这两种缓存除使用范围限制, 其他没什么不同, 下文基本不做区分.

关于缓存的控制, 主要是服务器和浏览器之间, 通过请求和响应的一些header来进行交互的, 所以本文的介绍过程中会穿插着介绍一些相关的header, 最后总结.

另外, 行文潦草, 缓存二字有时指浏览器的缓存系统, 有时指一条被缓存的HTTP响应消息.

## 缓存定义
在指南中对HTTP Cache做了如下定义:

- a local store of response messages
- the subsystem that controls storage, retrieval, and deletion of messages in it.

## 存的是什么
HTTP缓存是一种类似KV的storage.

基本的Key是由请求方法和目标URI构成的. 由于目前主要缓存GET请求的响应, 所以在chrome等浏览器中, 缓存的key只由uri构成.
value则是对应的key(uri), 在之前发起请求时得到的响应消息.

(value可能是多条, 这就涉及二级Key(secondary key): 当content negotiation时, 使用Vary特定的header作为二级key,[后文](#附加内容1-vary-header和缓存的二级key)详细介绍)

在chrome浏览器可以通过 chrome://cache/ 页面来查看当前的所有缓存([这个功能在chrome66版本后移除了, 玛德](https://superuser.com/questions/1316540/where-has-chrome-cache-been-moved-to))

![chrome缓存页面](/resources/httpcache/chrome-cache.png)

点进其中每一条, 就可以看到对应的被缓存的HTTP响应消息.

## 何时存(缓存先决条件)
因为RFC只是一份指南, 而具体的细节取决于其实现, 也就是说浏览器有很多自己控制的空间. 对于何时缓存, RFC 7234中使用这样的词汇: "MUST NOT store a response to any request, unless:", 就是说除非以下这些条件都满足, 否则不能缓存, 但是满足了这些条件, 浏览器到底要不要缓存却不一定. 我们来看一下这些条件:

- 特定的请求方法(GET,HEAD, POST(post只有显式的设置才会缓存))     且
- public cache时, 不能是Authentication的(参看[Cache-Control Header](#相关header))    且
- private cache时, 不能被中间代理缓存    且
- 响应没有no-store指令(参看[Cache-Control Header](#相关header))    且
- 特定的Headers符合条件:
  - Expires header      或
  - Cache Control header 中
    - 包含max-age/s-maxage指令     或
    - 包含public指令    或
    - **扩展指令**表示允许缓存    或
  - 特定的返回code( 200, 203, 204, 206, 300, 301, 404, 405, 410, 414, and 501) 

前几条要求都是比较好理解的, 也比较容易满足. 而第5条下面的各个"或"的要求中有一点: 只要返回码是200等, 就能缓存. 哇, 这就意味着, 大多数请求, 按规定都是可以缓存的, 这刷新了我以前"只有CSS/JS/图片才会缓存"的认知.

## 何时用
响应被缓存后, 什么时候,什么条件下才能被采用呢? 当一条新的请求要发出前, 浏览器要判断这些条件(When presented with a request, a cache MUST NOT reuse a stored response, unless):

- **uri match** stored response     且
- 对应缓存响应的原请求方法和当前**请求的方法相匹配** (原来是get请求缓存的现在发一个post就不能用)    且
- 当前请求的Header满足 对应缓存响应的**Vary的要求**(详见[后文](#附加内容1-vary-header和缓存的二级key))    且
- 请求没有**no-cache**指令 (参看[Cache-Control Header](#相关header))    且
- 对应的被缓存的响应是:
  - 新鲜的[(fresh)](#名词解释)   或
  - 被允许在不新鲜(stale)时 提供服务(主要是无法连接到原始服务的情况)      或
  - 成功验证过的(validated)

这些条件综合起来看, 就是用请求的uri作为key去缓存中查找到了对应的响应, 且响应的过期时间满足条件(所谓新鲜不新鲜,就是指过期时间). 新鲜问题是下一节的内容.

## 何时删除/过期
   删除和过期是两个操作, 缓存过期了, 浏览器默认也不会删除, 除非存储空间不足, 可能会使用LRU之类的策略清除一些.
   
   过期的问题, 或者说新鲜的问题, 就像是我们食品的”保质期”问题一样, 这个问题是关于缓存问题的唯一难点和重点.
   
   一个关于缓存是否新鲜/过期的简单公式
   
   ```response_is_fresh = (freshness_lifetime > current_age)```
   
  就是说是否新鲜 =  保质期限 是否大于 已出现/已被生产的时间.
  
### √关于一条缓存的保质期有多长, 有两种方式设置:
  
  - **显式的设置过期时间**
  
    > 通过Expires header或cache-control:max-age指令来设置,见[Header](#相关header)
  
  - **启发式的计算过期**
  
    我以前一直有个疑问, 响应header里没有缓存时间相关的内容, 也就是服务器就没有设置过期时间, 这时候怎么办?
     
    答案是 浏览器收到没有设置过期时间的响应时, 可以根据自己的算法来启发式的计算过期时间. 怎么计算呢, 一个典型的算法是
    
    ```freshness_lifetime = (date_value - last_modified_value) * 0.10 ```
    这个算式就是**当前**时间 减去 上次修改时间 乘 0.1, 效果就是当前离这个文件(响应)的上次修改时间越久, 那么保质期设置的越长, 浏览器就是认为越久没改动的文件, 改动的频度越小.
    
    感兴趣的同学可以看[chromium源码](https://chromium.googlesource.com/chromium/src/+/49.0.2606.2/net/http/http_response_headers.cc#1001)中对于这部分的处理.
    
### √关于一条缓存已出现/已被生产了多久, 即age问题:
  首先关于某条响应消息(比如一个css资源)真实生产了多久, 浏览器是难以知道的. 所以现在有两种方式可供浏览器来确定, 在它接到一条响应资源时,该资源的已有Age.
  
  - 表面上的Age:
   
      ```apparent_age = max(0, response_time - date_value);``` 
      
      > Date Header: 响应时刻, 用于响应中, 服务器生成标志这条响应在服务器端发出的时间, 是一个时间点, 格式如`Mon, 18 Sep 2017 13:07:28 GMT`
      
      response_time是指浏览器收到响应的时间.两者相减,若负取0.
  
  - 修正的Age Value:
  
      ```
      response_delay = response_time - request_time;
      corrected_age_value = age_value + response_delay;
      ```
      
      > Age Header: 年龄, 用于响应中, 服务器生成用于表示这条响应消息已存在的时间, 是一个时间长度, 格式如`3600` 单位秒.
  
  而实际上, 浏览器会取上面两个Age中的较大者, 作为浏览器收到这条响应时, 它已经具有的初始Age. 即:
  ```corrected_initial_age = max(apparent_age, corrected_age_value);```
  
  接下来用```resident_time = now - response_time;
              current_age = corrected_initial_age + resident_time;``` 初始Age加上 它在本缓存系统中待的时间, 就是这条缓存的当前Age了.
              
  我弄了幅图来展示Age的问题:
  
  ![Age计算](/resources/httpcache/cache-age.png)
              
  (TODO 其实我一直在思考, 为什么不用Last-Modified的值来帮助计算Age? 有想法的可以分享一下) 
  
  
  OK, 一条缓存的保质期多长可以知道了, 当前Age也知道了, 那么这条缓存是否过期/新鲜, 就如前所说比较一下就好了.
  
  那么假如一条缓存消息过期了, 前面我也提到了, 浏览器默认是不会删除的, 那他留着干嘛用啊. 其实过期不删是因为, 浏览器可以发起一个**验证**过程为它续命.
  
### √验证 [(validation)](#名词解释) 
  
  验证是通过条件请求实现的(RFC7232:conditional request mechanism).
  
  条件请求就是指请求通过header带上某种条件,服务器通过判断条件是否满足来决定怎么处理.
  条件请求主要用于:
  
  - Cache update
  - state-changing methods, such as PUT and DELETE, 
to prevent the “lost update" problem
  
对于缓存验证, 我们有两种条件请求可以发.
  
  1. ETag方式.
  
      ETag全称Entity Tag, 是资源的标签的意思, 其值是一个任意的字符串, 具体内容是服务器自己决定的, 只有他自己知道, 但要求服务器保证, 同一个资源多次修改, ETag一定是不同的, 不同资源的ETag可以相同. 

      一些如Nginx等服务器对静态文件生成ETag的方式使用文件size和文件修改时间组合出来的, 还有一些直接用文件md5当做ETag, 简单有效.
    
      当服务器的响应中带有ETag Header值(如ETag:599a8d1c-eb), 浏览器缓存后想要验证这个响应,就发送一个带有If-None-Match Header的请求(如If-None-Match:599a8d1c-eb), 就是问服务器, 我缓存的这个资源是标志号是599a8d1c-eb, match or not啊?
    
  2. Last-Modified方式.

      Last-Modified, 服务器在响应中加入这个header表示自己认定的这个资源的上次修改时间. 一般Nginx在Linux服务器直接用文件系统的修改时间. 带这个header的缓存, 在验证时发送带If-Modified-Since Header的请求.
  

服务器验证条件, 如果条件不满足, 返回302, 浏览器即认为, 缓存没改动过可以继续使用, 并更新一下过期时间和Age之类的属性, 相当于重获新生了.
如果条件满足, 那么就返回200+新的完整响应, 用它替代缓存里的过期内容.


(上面提到两种验证方式同时出现时, 以ETag为准, 因为认为ETag方式比Last-Modified更强更准确一些.)
(另一个疑惑点就是如果没有ETag没有Last-Modified该怎么发起验证. 答案是可以的, ETag浏览器不能凭空造出来, 但是modified的时间可以, 如果Last-Modified没有就用Date header的时间, 如果Date也没有,就用存这条缓存的时间.)

> 脑筋急转弯:有一种`If-None-Match:*`的条件请求是咋回事?
> 其实是在问服务器资源是否 "和*不匹配", 可是长什么样的资源都和 *匹配啊, 哦, 是在问有没有啊, 只有有旧满足, 没有这号资源就不满足.
  
## 相关Header
这里汇总一些缓存相关的Header, 这些header有些是出现在请求中, 有些是出现在响应中, 有些是请求响应都可用, 会分别介绍.

  - Cache-Control: 关于缓存控制的超强Header.他的值不是单一的, 而是逗号分隔的kv形式. 比如`cache-control:public, max-age=31536000`. 
      也就是说他的值里又有key, cache-control值里的key叫做指令, 比如max-age指令等.除了基本的规定好的一些指令, 指南还指出, 可以在这里添加自己的自定义指令, 指令含义和实现自己弄去.
      
      我们只说Cache-Control的一些基本指令:
      
      - public/private指令. 用于响应中, 如本文[开头](#划清范围)所说, 缓存是分public/private的, 通过cache-control:public这种方式指定.
      - no-store指令. 不要缓存!不要缓存!不要缓存! 请求和响应中都可以用, 表示关于这条请求或响应的任何内容都请不要缓存, 已被缓存的也要清了.
      - no-cache指令. 和上面的no-store长得太像了, 含义也模糊不清的. 
          
          该指令用于请求时, 表示对于缓存必须先经过验证才能使用, 不论过不过期都验证.(强刷时发送的请求就是no-cache的).
          该指令用于响应时, 表示这条响应被缓存后, 每一次使用前都要验证.
      - max-age指令. 最大过期时间, 是一个时间长度, 格式如`3600` 单位秒.
      - ...cache-control还有好一些相关指令, 感兴趣的请参看RFC7234.cache-control过于复杂,在网上看到一张图帮你决策该如何设置cache-control.
      ![set-cache-control](/resources/httpcache/http-cache-decision-tree.png)
 
  - Expires: 顾名思义, 用于响应中, 设置过期时间, 是一个时间点, 格式如 `Thu, 01 Dec 1994 16:00:00 GMT`.
  - Age: 前文已述.
  - Date: 前文已述.
  - Pragma: http 1.0时代的header, 功能类似cache-control, 已被替代, 略过.
  
下面两组四个header是和`验证`有关的: 
  
  - ETag: 资源实体标签, 用于响应, 格式如`”599a8d1c-eb”  “W/599a8d1c-eb”`
  - If-None-Match: 是否匹配我的ETag, 用于请求, 格式同上(其实像这个header有一个相反的header叫If-Match,但不用于缓存相关,具体看RFC7232)
  - Last-Modified: 资源上次修改时间, 用于响应, 格式如`Mon, 21 Aug 2017 07:34:52 GMT`  
  - If-Modified-Since: 自从Last-Modified之后是否修改过, 用于请求, 格式同上
  
  - Vary: 参看[后文](#附加内容1-vary-header和缓存的二级key)
  
## 演示实例
写博客这一点不好, 不能现场演示. 感兴趣的同学打开浏览器控制台, 去各个网站看一下, 他们的响应的缓存是怎么控制的. 另外我演示是采用的Nginx响应几个静态文件, 通过Nginx配置set header功能来演示如下几种情况.
  
  - 请求1 -> 响应1设置header被缓存 -> 请求2直接用缓存 ->请求3 发现过期,验证 ->响应2续命.
    即如图的过程, 这个过程极好, 一定要亲自试一下.
    ![缓存示例](/resources/httpcache/HTTPStaleness.png)
  - 强刷时发送的什么(no-cache).
  - chrome对过期时间的启发式算法(即Last-Modified离得越久远, 缓存过期时间会越长)
  
  (演示时为了不被以前的缓存影响, 我通过/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome —disk-cache-dir=/Users/xxx/Downloads/testcache方式启动, 指定Cache目录, 这时打开的浏览器啥缓存都没有)

## 名词解释
- `Fresh` : 新鲜的 A stored response is considered “fresh"  if the response can be reused without “validation”.
- `Stale` : 不新鲜的
- `validation` : 验证 checking with the origin server to see if the cached response remains valid for this request
- `age` : 年龄 A response’s age is the time that has passed since it was generated by, or successfully validated with, the origin server.
- `cache eviction` : 缓存逐出 Caches have finite storage so items are periodically removed from storage
- `selecting header` : 是指响应的Vary头的值里指定的header

## 附加内容1: Vary Header和缓存的二级Key
前文提到, 正常的缓存是uri做key, 响应消息作为value的, 当Vary这个Header出现是, 缓存就变是了Key - Key - Value了.

Vary这个Header用于响应, 其值是另一个Header的名, 常见的用法比如Vary:User-Agent和Vary:Content-Encoding. 其效果是使用uri作为一级key, 使用Vary指定header的值作为二级key, 根据二级key的不同取值 缓存分开存分开取用的效果, 具体看图

![HTTPVary](/resources/httpcache/HTTPVary.png)
## 附加内容2: 缓存爆裂Cache Busting
缓存爆裂,是我从Ruby on Rails中看到的一个词, 是指通过一定技术手段, 强行是的浏览器端的缓存失效, 达到爆裂效果, 使得浏览器获取资源的最新版本.

问题在于: As HTTP is a client-server protocol, servers can't contact caches and clients when a resource change

在无状态的clinet/server模式的http(不要想着websocket了)想要缓存更新, 服务器没法主动像浏览器发消息说"文件修改了, 你更新一下缓存吧".
那么解决方式有两类:

- 普通的方式:  过期时间设短, 甚至每次都验证.  
- 资源路径上做手脚: 唯一能通知客户端的机会, 就是浏览器打开页面的时候. 所以服务器在动态生成这个页面的时候, css等资源的路径, 是加上了指纹或者版本号的.

  像这样https://static.zhihu.com/heifetz/main.app.20324562c3086d23dafd.css 或 https://www.facebook.com/rsrc.php/v3/yO/l/1,cross/4Y0R4Z6VSQ_.css

  在Spring MVC中提供了一种基于文件MD5的[静态文件指纹方案](https://spring.io/blog/2014/07/24/spring-framework-4-1-handling-static-web-resources).
  ([新版Spring也提供了ETag等方式](https://docs.spring.io/spring/docs/current/spring-framework-reference/web.html#mvc-caching))

## 总结
那么关于 什么是缓存/怎么做缓存/为何强刷/如何不强刷 这篇博客也是够长了.

## 参考
- RFC 7234 7232 7231 https://tools.ietf.org/html/rfc7234
- HTTP 缓存 MDN https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching
- HTTP Caching - Google Developer https://developers.google.com/web/fundamentals/performance/optimizing-content-efficiency/http-caching
- chrome://view-http-cache/
- 过期时间 - Chrome源码 https://chromium.googlesource.com/chromium/src/+/49.0.2606.2/net/http/http_response_headers.cc#1001
- Chromium document https://www.chromium.org/developers/design-documents/network-stack/http-cache
- 304 https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/304

