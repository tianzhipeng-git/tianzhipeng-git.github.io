---
layout: post
title: "Web项目迁移到SpringBoot"
date: 2018-07-02 23:23:23
categories: web
tags: web spring
comments: true
---

Spring Boot 是一个整合类的项目, 官方自称 **"约定大于配置的快速启动框架"**, 核心是快速, 开箱即用.

* TOC
{:toc}

1.  maven 配置更自动化: **Starters**, 不用写版本号
2.  项目配置更自动化: **AutoConfiguration**, 提前配置有很多 default 值.  抛弃 xml, 使用 java 方式 config
3.  Just run, **可执行的 java 程序**, 内嵌 tomcat.

## 参考文章

*   [官方文档](https://docs.spring.io/spring-boot/docs/current-SNAPSHOT/reference/htmlsingle/#getting-started)
*   [SpringBoot 核心知识点](http://luecsc.blog.51cto.com/2219432/1964056)
*   [SpringBoot 学习资料汇总贴](http://www.ityouknow.com/springboot/2015/12/30/springboot-collect.html)
*   [一篇分析 SpringBoot 启动过程 和常用扩展接口的博客](https://github.com/chanjarster/spring-boot-all-callbacks)

## 如何迁移 / 改造

*   [spring 项目改造为 java 方式配置, 干掉 xml](http://www.robinhowlett.com/blog/2013/02/13/spring-app-migration-from-xml-to-java-based-config/)
*   [官方文档: 改造旧项目到 SpringBoot](https://docs.spring.io/spring-boot/docs/current-SNAPSHOT/reference/htmlsingle/#howto-convert-an-existing-application-to-spring-boot)

## 四步走

*   **pom.xml** 改造为依赖 springboot 的 parent 和 starter, 改造之后依赖包都正常的话依旧可以使用 tomcat 方式启动.
*   **Application.java** 和 XXConfig.java. 增加 Application 类和 application.yml 和一些 @Configuration 类, 可以暂时 @ImportResource 之前的 xml 配置文件.
*   **web.xml** 这个要干掉, 里面的东西相应地移到一个 @Configuration 中, 或 application.yml 中. listener 和 filter 都对应使用 java 方式配置. 这里有一些东西 springboot 默认就配了. 至此, 应该可以使用 Application 这个类直接启动程序.
*   **context.xml** 逐步将 xml 方式配置的东西, 移动到 java 方式配置. 这里有一些东西 springboot 默认就配了.  

## 踩的坑 & tips:

*   若项目使用 maven resoure filter 的功能,  原来用 ${} 作为占位符, 被 springboot 改为使用 @@作为占位符
*   注意日志 logback/log4j 中一般都配置里日志位置在 catalina.home 下面, 改为 SpringBoot 后需要指定到别处.
*   SpringBoot 1.x 升级到 2.x 之后, 很多配置项都改了, google 问题的时候也要注意不要使用了 1.x 的方案

*   servlet / filter / listener 可以使用如下:

<pre>@Bean
public FilterRegistrationBean someFilterRegistration() {
    FilterRegistrationBean registration = new FilterRegistrationBean();
    registration.setFilter(someFilter());
    registration.addUrlPatterns("/url/*");
    registration.addInitParameter("paramName", "paramValue");
    registration.setName("someFilter");
    registration.setOrder(1);
    return registration;
}</pre>

或

<pre>@Component
public class XClacksOverhead implements Filter {
</pre>



*   spring 4.x 版本开始直接移除了对 velocity 的支持, 为了兼容发现了一个项目. 然而这个项目在中央 maven 库中没有, 我安装到公司的 maven 库中了.

<pre><dependency>
    <groupId>com.shield-solutions</groupId>
    <artifactId>spring-velocity-adapter</artifactId>
    <version>1.0.0.RELEASE</version>
</dependency></pre>

*   像之前管用的 maven 目录结构一般是

<pre>src
└── main
    ├── java
    ├── profiles
    ├── resources
    └── webapp
        └── WEB-INF</pre>

这个吊样的,  使用 war 的方式打包,  编译的 class 和 web 资源会放在 war 里面的 WEB-INF 目录中, 这个 war 会作为 ServletContext 的上下文路径. 而 velocity 中有个 WebappResourceLoader 会使用这个路径去找资源 `servletContext.getResourceAsStream(path);` 

当改成 Spring Boot 内嵌 tomcat 独立运行时, ServletContext 会被指到一个操作系统程序运行缓存目录下, velocity 就出现找不到. vm 了. 

按 Spring 的意思是不再推荐使用 src/main/webapp 这个目录了, 直接用 resources/static 这种,  用 classpath 找资源. 所以我目前的解决方案是干掉 velocity 的 WebappResourceLoader 改为 ClasspathResourceLoader, 并修改指定. vm 文件的各个配置.

<br/>

*   改完之后发现 fontawsome 不好使了, 原因是 maven 的 filter 把字体文件搞坏了. 在 resource 配置不要 filter 静态资源

*   ClassPathResource 失效.  
    *   传统 war 包方式, 项目中有可能使用 ClassPathResource 加载资源, 变成 SpringBoot 之后出现的问题在于, 传统 war 会解压, 里面都是单独的文件系统文件, SpringBoot 的资源都在 jar 内部, 不是单独的文件.
    *   使用 ClassPathResource, getResource, **getFile 会出错**, getStream 是可以的. 也就是说不能使用文件相关方法去操作 ClassPathResource.
    *   解决方案一: 不再使用 file 的相关方法, 或者将资源移出 jar 包, 另外找位置放
    *   解决方案二: [github 找到一个项目](https://github.com/ulisesbocchio/spring-boot-jar-resources),  其编写了一个 JarResourceLoader, 用它获得的 resource 当需要时, 会将文件解压到临时目录,  就可以使用 file 相关方法了.

*   xml 配置转 Java 配置对应关系:

| xml 配置 | 注解 | 接口 |
|:-------------:|:-------------:|-----:|
| `<task:annotation-driven> <task:scheduler>` | @EnableAsync @EnableScheduling |SchedulingConfigurerAsyncConfigurer |
| `<mvc:annotation-driven>` | @EnableWebMvc |  |
| `<context:property-placeholder>` | @PropertySource |  |
| `<mvc:default-servlet-handler/>` |  | DefaultServletHandlerConfigurer |
| `<context:component-scan/>` | @ComponentScan |  |
