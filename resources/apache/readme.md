# 数据处理过程
从 https://projects.apache.org/projects.html 获取的Apache项目数据.

## 页面jq抓
页面上有几种展示方式
- By Name 
- By Committee
- By Category
- By Programming Language
- By Number of Committers

在by name页面用`$("#list > ul").children().length` 当前项目列表共370项, 包括`in the Attic`和`Incubating`.
```
a="";
b=$("#list > ul").children();
for (i=0;i<b.length;i++) 
{   
    name = b[i].innerText
    if (name.indexOf('(') != -1) {
        name = name.substr(0, name.indexOf('('))
    }
    a = a + name.trim() + "\n"
}
copy(a)
//存放在pageselect.list中
```

## json网络请求
从网络请求后台看, 有几个ajax的json:
- /json/foundation/committees.json	
- /json/foundation/groups.json	
- /json/foundation/people_name.json	
- /json/foundation/podlings.json	
- /json/foundation/projects.json	
- /json/foundation/committees-retired.json	
- /json/foundation/podlings-history.json	
- /json/foundation/repositories.json

下载下来统计
- `cat projects.json| jq 'keys[]'|wc -l` 283个项目, 貌似包括`in the Attic`, 包括部分`Incubating`(如datafu).
- `cat podlings.json| jq 'keys[]'|wc -l` 45个项目, 都是`Incubating`, 加上283,有部分重复,共324, 还是不够啊.
- 还有些奇怪的如airflow 不在这俩里面, 在committee里. 但committee里, 出现Apache Commons, 不是一个单独的项目, 在projects里是由多个commons-xx的.

分析
- 提取name
`cat podlings.json| jq '.[].name | .[0:-13]'`
- 三个.name合成name.all
- name.all和pageselect.list对比, 前者完全包含后者, 多出的多是committees.name的.


## 处理步骤
- 删除release/releases/maintainer
`cat projects.json| jq 'del(.[].release)'| jq 'del(.[].maintainer)'| jq 'del(.[].implements)'| jq 'del(.[].developer)'| jq 'del(.[].member)'| jq 'del(.[].helper)' > projects1.json`
`cat committees.json| jq 'del(.[].roster)' > committees1.json`
- 三份数据处理为以name为key的json. 

    ```
    a1=xx;//projects 
    b1={}; 
    for(i in a1) {
        b1[a1[i].name] = a1[i];
    }

    a2=xx//podlings
    b2={}
    for(i in a2) {
        var c=a2[i].name; //去掉(Incubating)
        b2[c.substr(0, c.length-13)] = a2[i]
    }
    
    a3=xx
    b3={}
    for(i in a3) {
        b3[a3[i].name] = a3[i];
    }
    ```

主要用到的属性:

- name
- language
- status 可通过pmc判断?
- category
- created 创建时间
- shortdesc
- description
- homepage
- license

合并策略

以pageselect为keys, 以projects > podings > committees的优先级获取信息.
```
ks = a.split("\n")
rs=[]
b1={}
b2={}
b3={}
for (i=0;i<ks.length;i++) {
    k = ks[i];
    if(b1[k]) {
        rs.push(b1[k]);
    } else if (b2[k]) {
        rs.push(b2[k]);
    } else {
        rs.push(b3[k]);
    }
}
```

## 其他辅助数据处理代码

处理filter用的数据
1. 把要过滤的列的数据去重整理.
2. `cat lang2 | awk '{print "{text:\""$1"\", value:\""$1"\"},"}' > lang.filter`


处理custom.key.json
```
rs=[{name:"af", type:"ff"}]
cst={"af": {type:"dd"}}
for (i=0;i<=366;i++) {
    var nm = rs[i].name;
    if(cst[nm]) {
        for(j in cst[nm]) {
            rs[i][j] = cst[nm][j]
        }
    }
}
```

DataFu为啥页面列表里有俩
Apache Fluo YARN
Apache Fluo Recipes