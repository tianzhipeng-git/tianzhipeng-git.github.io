从 https://projects.apache.org/projects.html 获取的Apache项目数据.

$("#list > ul").children().length 当前项目列表共370项, 包括`in the Attic`和`Incubating`.
for (i=0;i<370;i++) { a=a+b[i].innerText+"\n"}

- `cat projects.json| jq 'keys[]'|wc -l` 283个项目, 貌似包括`in the Attic`, 包括部分`Incubating`(如datafu).
- `cat podlings.json| jq 'keys[]'|wc -l` 45个项目, 都是`Incubating`, 加上283,有部分重复,共324, 还是不够啊.
- 还有些奇怪的如airflow 不在这俩里面, 在committee里. 但committee里, 出现Apache Commons, 不是一个单独的项目, 在projects里是由多个commons-xx的.


删除release/releases/maintainer
cat projects.json| jq 'del(.[].release)' > projects1.json

提取name
cat podlings.json| jq '.[].name | .[0:-13]'
三个.name合成name.all

name.all和pageselect.list对比, 前者完全包含后者, 多出的多是committees.name的.

最终策略, 以pageselect为keys, 以projects > podings > committees的优先级获取信息.
1. 先把三份数据处理为以name为key的json. 
    - `a=xx ; b={} ; for(i in a) {b[a[i].name] = a[i]}`
    - `for(i in a) {c=a[i].name; b[c.substr(0, c.length-13)] = a[i]}`
    - replace  (Incubating)
2. 提供要用到的属性:
    - name
    - language
    - status 可通过pmc判断?
    - category
    - created 创建时间
    - shortdesc/description
    - homepage
    - license


```
ks = a.split("\n")
rs=[]
d1={}
d2={}
d3={}
for (i=0;i<=366;i++) {
    k = ks[i];
    if(d1[k]) {
        rs.push(d1[k]);
    } else if (d2[k]) {
        rs.push(d2[k]);
    } else {
        rs.push(d3[k]);
    }
}
```

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
