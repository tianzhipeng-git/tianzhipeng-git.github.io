var json1 = {
    "request": {
        "method": "GET",
        "uri": "/get",
        "url": "http://httpbin.org:8000/get",
        "size": "75",
        "querystring": {},
        "headers": {
            "accept": "*/*",
            "host": "httpbin.org",
            "user-agent": "curl/7.37.1"
        },
        "tls": {
            "version": "TLSv1.2",
            "cipher": "ECDHE-RSA-AES256-GCM-SHA384",
            "supported_client_ciphers": "ECDHE-RSA-AES256-GCM-SHA384",
            "client_verify": "NONE"
        }
    },
    "upstream_uri": "/",
    "response": {
        "status": 200,
        "size": "434",
        "headers": {
            "Content-Length": "197",
            "via": "kong/0.3.0",
            "Connection": "close",
            "access-control-allow-credentials": "true",
            "Content-Type": "application/json",
            "server": "nginx",
            "access-control-allow-origin": "*"
        }
    },
    "tries": [
        {
            "state": "next",
            "code": 502,
            "ip": "127.0.0.1",
            "port": 8000
        },
        {
            "ip": "127.0.0.1",
            "port": 8000
        }
    ],
    "authenticated_entity": {
        "consumer_id": "80f74eef-31b8-45d5-c525-ae532297ea8e",
        "id": "eaa330c0-4cff-47f5-c79e-b2e4f355207e"
    },
    "route": {
        "created_at": 1521555129,
        "hosts": null,
        "id": "75818c5f-202d-4b82-a553-6a46e7c9a19e",
        "methods": null,
        "paths": [
            "/example-path"
        ],
        "preserve_host": false,
        "protocols": [
            "http",
            "https"
        ],
        "regex_priority": 0,
        "service": {
            "id": "0590139e-7481-466c-bcdf-929adcaaf804"
        },
        "strip_path": true,
        "updated_at": 1521555129
    },
    "service": {
        "connect_timeout": 60000,
        "created_at": 1521554518,
        "host": "example.com",
        "id": "0590139e-7481-466c-bcdf-929adcaaf804",
        "name": "myservice",
        "path": "/",
        "port": 80,
        "protocol": "http",
        "read_timeout": 60000,
        "retries": 5,
        "updated_at": 1521554518,
        "write_timeout": 60000
    },
    "workspaces": [
        {
            "id":"b7cac81a-05dc-41f5-b6dc-b87e29b6c3a3",
            "name": "default"
        }
    ],
    "consumer": {
        "username": "demo",
        "created_at": 1491847011000,
        "id": "35b03bfc-7a5b-4a23-a594-aa350c585fa8"
    },
    "latencies": {
        "proxy": 1430,
        "kong": 9,
        "request": 1921
    },
    "client_ip": "127.0.0.1",
    "started_at": 1433209822425
};
$("#syslog").JSONView(json1, {
    collapsed: true
});
$("#syslog").JSONView('expand', 0);

var json2 = {
    "type": "kafka",
    "dataSchema": {
        "dataSource": "kong-realtime",
        "parser": {
            "type": "string",
            "parseSpec": {
                "format": "dynamic-json",
                "dynamicKeyDim": "service",
                "customConfigUrl": "https://aster-admin.cn.miaozhen.com/plugins/syslog/dimensions_all",
                "flattenSpec": {
                    "useFieldDiscovery": false,
                    "fields": [{
                            "type": "path",
                            "name": "service",
                            "expr": "$.service.name"
                        },
                        {
                            "type": "path",
                            "name": "host",
                            "expr": "$.request.headers.host"
                        },
                        {
                            "type": "path",
                            "name": "upstream_uri",
                            "expr": "$.upstream_uri"
                        },
                        {
                            "type": "path",
                            "name": "uri",
                            "expr": "$.request.uri"
                        },
                        {
                            "type": "path",
                            "name": "status_code",
                            "expr": "$.response.status"
                        },
                        {
                            "type": "path",
                            "name": "method",
                            "expr": "$.request.method"
                        },
                        {
                            "type": "jq",
                            "name": "upstream_ip_port",
                            "expr": "(.tries[-1].ip + \":\" + (.tries[-1].port|tostring))"
                        },
                        {
                            "type": "jq",
                            "name": "reach_upstream",
                            "expr": "(.tries|length != 0)"
                        },
                        {
                            "type": "path",
                            "name": "request_size",
                            "expr": "$.request.size"
                        },
                        {
                            "type": "path",
                            "name": "response_size",
                            "expr": "$.response.size"
                        },
                        {
                            "type": "path",
                            "name": "request_latency",
                            "expr": "$.latencies.request"
                        },
                        {
                            "type": "path",
                            "name": "kong_latency",
                            "expr": "$.latencies.kong"
                        },
                        {
                            "type": "root",
                            "name": "started_at"
                        }
                    ]
                },
                "dimensionsSpec": {
                    "dimensions": [
                        "service",
                        "host",
                        "upstream_uri",
                        "uri",
                        {
                            "type": "long",
                            "name": "status_code"
                        },
                        "method",
                        "upstream_ip_port",
                        "reach_upstream",
                        "custom1",
                        "custom2",
                        "custom3"
                    ],
                    "dimensionsExclusions": [
                        "ignore_me"
                    ]
                },
                "timestampSpec": {
                    "column": "started_at"
                }
            }
        },
        "metricsSpec": [{
                "type": "count",
                "name": "count"
            },
            {
                "type": "quantilesDoublesSketch",
                "name": "request_size",
                "fieldName": "request_size"
            },
            {
                "type": "quantilesDoublesSketch",
                "name": "response_size",
                "fieldName": "response_size"
            },
            {
                "type": "quantilesDoublesSketch",
                "name": "request_latency",
                "fieldName": "request_latency"
            },
            {
                "type": "quantilesDoublesSketch",
                "name": "kong_latency",
                "fieldName": "kong_latency"
            }
        ],
        "granularitySpec": {
            "type": "uniform",
            "segmentGranularity": "day",
            "queryGranularity": "day",
            "rollup": true
        }
    },
    "ioConfig": {
        "topic": "aster-kong-log",
        "consumerProperties": {
            "bootstrap.servers": "1.2.3.4:9092"
        }
    },
    "tuningConfig": {
        "type": "kafka",
        "logParseExceptions": true
    }
};
$("#druidtask").JSONView(json2, {
    collapsed: true
});
$("#druidtask").JSONView('expand', 0);