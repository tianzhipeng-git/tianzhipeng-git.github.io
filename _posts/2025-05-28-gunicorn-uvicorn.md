---
layout: post
title: "Gunicorn/Uvicorn/WSGI/Nginx乱七八糟的关系"
date: 2025-05-28 23:23:23
categories: "web&network"
tags: web http
keywords: gunicorn uvicorn wsgi nginx asgi fastapi django
excerpt: 梳理python web部署的这些组件的关系
comments: true
---

* TOC
{:toc}

## 总览
不废话, 先看表格

| 组件 | 协议(向上提供服务) | 协议(向下转发) | 备注 |
| --- | --- | --- | --- |
| Nginx | HTTP|HTTP, uwsgi | unix socket对位的是TCP |
| Gunicorn | HTTP | WSGI |  |
| uWSGI | HTTP, uwsgi|WSGI | 太老旧, 废弃<br>uWSGI是一个服务器, uwsgi是他的协议<br>Nginx的uwsgi_pass可对接 |
| Uvicorn | HTTP|ASGI |  |
| Django/Flask | WSGI || WSGI  is a Python standard, 不是通信<br>直接进程内import, 函数调用<br>另外Django自带一个开发用http服务 |
| FastAPI(Starlette) | ASGI || ASGI也一样, 区别是异步 |

根据表格中的协议, 以上组件可以组合出n种部署方案.

同步应用部署方案:
- 🚧Django (runserver基于wsgiref)  
- ❌Gunicorn → Django
- ✅Nginx → Gunicorn → Django
- ❌uWSGI → Django
- ❌Nginx → uWSGI → Django

异步应用部署方案:
- 🚧Uvicorn → FastAPI
- ❌Gunicorn → Uvicorn → FastAPI
- ❌Nginx → Uvicorn → FastAPI
- ✅Nginx → Gunicorn → Uvicorn → FastAPI

🚧是本地开发调试用的
✅是推荐的线上方案
❌是不推荐

真的挺混乱的, 其实还有更多类似的组件和库没放进去呢.

分类和简化一下上述概念可以得出, 走网络的通信协议:
- HTTP
- uwsgi

进程内部python函数调用标准:
- WSGI
- ASGI

## Gunicorn
如果是基于WSGI的同步应用, Gunicorn是最佳选项. Gunicorn提供的核心功能
- 负责接受和解析HTTP
- WSGI协议支持
- 多worker进程管理(pre-fork worker model)

### Gunicorn和Django
- worker进程就和Django是同一个进程
- Gunicorn和Django之间是WSGI, 不用走网络请求了
- 多个进程监听同一端口?
    是的. 通过共享socket或者reuseport功能.

### WSGI
一个简单函数:
```python
def simple_app(environ, start_response):
    status = '200 OK'
    headers = [('Content-Type', 'text/plain')]
    start_response(status, headers)
    return [b"Hello, WSGI!"]

# 使用 wsgiref 内置服务器运行
from wsgiref.simple_server import make_server
httpd = make_server('', 8000, simple_app)
print("Serving on port 8000...")
httpd.serve_forever()
```

说明:
- environ: 一个包含请求信息的字典（如路径、请求方法等）
- start_response(status, headers): 一个函数，用于发送HTTP响应状态和头部信息
- 返回值：必须是一个 可迭代对象，其中每个元素是bytes

### Nginx和Gunicorn
- Gunicorn独自就能干活了, 为啥要加一层Nginx?

    [根据SO上的问题](https://serverfault.com/questions/331256/why-do-i-need-Nginx-and-something-like-Gunicorn), 大部分生产级复杂系统, 都有很多不应该交由Python来响应的请求, 如静态资源, 这就需要加一层Nginx.

- Nginx会不会将请求转换为wsgi再发给应用服务呢?

    不会, Nginx又不是python, 调用不了python方法, 没实现wsgi; uwsgi一字之差啊;
- Nginx和Gunicorn之间的通信?
    
    简单的HTTP转发关系, 同一台机器上使用unix socket连接, unix socket对位的是TCP.

- 他俩谁会解析HTTP请求?

    都会. 
    Nginx出于转发规则的目的, 也要知道HTTP请求路径之类的信息.
    Gunicorn则要完整解析HTTP请求, 之后通过WSGI转给Django.

### Nginx → Gunicorn → Django 完整流程图👍🏻

<pre class="mermaid" style="width: 40%;">
 graph TD
    a1["Django"]
    a2["Django"]
    a3["Django"]
    Client -->|HTTP| Nginx
    subgraph Nginx
		    Port-80 -->|HTTP| NginxWorker-1
		    Port-80 -->|HTTP| NginxWorker-2
		    Port-80 -->|HTTP| NginxWorker-N
    end
    Nginx -->|HTTP| Gunicorn
    subgraph Gunicorn
		    Port-8080 -->|HTTP| GunicornSyncWorker-1
		    Port-8080 -->|HTTP| GunicornSyncWorker-2
		    Port-8080 -->|HTTP| GunicornSyncWorker-N
        subgraph "Gunicorn-N"
            GunicornSyncWorker-N -->|WSGI| a3
        end
        subgraph "Gunicorn-2"
            GunicornSyncWorker-2 -->|WSGI| a2
        end
        subgraph "Gunicorn-1"
            GunicornSyncWorker-1 -->|WSGI| a1
        end
    end

    desc1["实线矩形是进程"]

style desc1 fill:#fff,stroke:#fff,color:#555,font-style:italic
style Port-8080 fill:#f0f0f0,stroke:#ccc,stroke-dasharray: 5 5,color:#999
style Port-80 fill:#f0f0f0,stroke:#ccc,stroke-dasharray: 5 5,color:#999
style Gunicorn stroke:#ccc,stroke-dasharray: 5 5,color:#999
style Nginx stroke:#ccc,stroke-dasharray: 5 5,color:#999
style GunicornSyncWorker-1 stroke:#ccc,stroke-dasharray: 5 5,color:#999
style GunicornSyncWorker-2 stroke:#ccc,stroke-dasharray: 5 5,color:#999
style GunicornSyncWorker-N stroke:#ccc,stroke-dasharray: 5 5,color:#999
style a1 stroke:#ccc,stroke-dasharray: 5 5,color:#999
style a2 stroke:#ccc,stroke-dasharray: 5 5,color:#999
style a3 stroke:#ccc,stroke-dasharray: 5 5,color:#999
</pre>


## Uvicorn
实现了ASGI的应用服务器

### ASGI
一个async函数
```python
async def app(scope, receive, send):
    if scope["type"] == "http":
        event = await receive()
        body = event.get("body", b"")
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-type", b"text/plain")],
        })
        await send({
            "type": "http.response.body",
            "body": body,
        })
```
说明:
- `receive`: 等待客户端发送事件的协程函数
- `send`: 向客户端发送事件的协程函数
- `scope`: 请求的上下文信息（如类型、路径、headers）

    ```
    {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"host", b"example.com")]
    }
    ```

| 特性 | WSGI | ASGI |
| --- | --- | --- |
| 是否异步支持 | ❌ 不支持（同步阻塞） | ✅ 原生支持异步与并发 |
| 支持 WebSocket | ❌ | ✅ 支持 |
| 服务端模型 | 线程/进程 | 协程（事件循环） |


### Uvicorn和Gunicorn
Uvicorn已经能提供http服务了, 为啥还用Gunicorn:
- **Gunicorn 的进程管理能力**: Gunicorn 具有强大的进程管理能力，可以监控 worker 进程的运行状态，并在进程崩溃时自动重启。这对于保证应用的稳定性和可靠性非常有帮助。
- **Uvicorn 的高性能**: Uvicorn 在处理异步应用时具有很高的性能，可以有效地提高应用的吞吐量和响应速度。

### Nginx → Gunicorn → Uvicorn → FastAPI 完整流程图👍🏻


<pre class="mermaid" style="width: 40%;">
graph TD
    a1["FastAPI"]
    a2["FastAPI"]
    a3["FastAPI"]
    Client -->|HTTP| Nginx
    subgraph Nginx
		    Port-80 -->|HTTP| NginxWorker-1
		    Port-80 -->|HTTP| NginxWorker-2
		    Port-80 -->|HTTP| NginxWorker-N
    end
    Nginx -->|HTTP| Gunicorn
    subgraph Gunicorn
		    Port-8080 -->|HTTP| UvicornWorker-1
		    Port-8080 -->|HTTP| UvicornWorker-2
		    Port-8080 -->|HTTP| UvicornWorker-N
        subgraph "Gunicorn-N"
            UvicornWorker-N -->|ASGI| a3
        end
        subgraph "Gunicorn-2"
            UvicornWorker-2 -->|ASGI| a2
        end
        subgraph "Gunicorn-1"
            UvicornWorker-1 -->|ASGI| a1
        end
    end

    desc1["实线矩形是进程"]

style desc1 fill:#fff,stroke:#fff,color:#555,font-style:italic
style Port-8080 fill:#f0f0f0,stroke:#ccc,stroke-dasharray: 5 5,color:#999
style Port-80 fill:#f0f0f0,stroke:#ccc,stroke-dasharray: 5 5,color:#999
style Gunicorn stroke:#ccc,stroke-dasharray: 5 5,color:#999
style Nginx stroke:#ccc,stroke-dasharray: 5 5,color:#999
style UvicornWorker-1 stroke:#ccc,stroke-dasharray: 5 5,color:#999
style UvicornWorker-2 stroke:#ccc,stroke-dasharray: 5 5,color:#999
style UvicornWorker-N stroke:#ccc,stroke-dasharray: 5 5,color:#999
style a1 stroke:#ccc,stroke-dasharray: 5 5,color:#999
style a2 stroke:#ccc,stroke-dasharray: 5 5,color:#999
style a3 stroke:#ccc,stroke-dasharray: 5 5,color:#999
</pre>

| 距离上一篇文章又隔了一年多了啊, 又在瞎忙, 没啥内容产出