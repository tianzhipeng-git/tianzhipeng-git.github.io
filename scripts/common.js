$(function () {
    String.prototype.hashCode = function () {
        for (var ret = 0, i = 0, len = this.length; i < len; i++) {
            ret = (31 * ret + this.charCodeAt(i)) << 0;
        }
        return ret;
    };
    // 百度统计
    var _hmt = _hmt || [];
    (function() {
      var hm = document.createElement("script");
      hm.src = "https://hm.baidu.com/hm.js?7418fd40e3c901d443c89773d5ebf421";
      var s = document.getElementsByTagName("script")[0]; 
      s.parentNode.insertBefore(hm, s);
    })();

    // 向上的滚动按钮
    $("#gotop").on('click', function () {
        jQuery("html,body").animate({
            scrollTop: 0
        }, 500);
    });
    $(window).on('load', function () {
        $('#gotop').hide();
    });
    $(window).on('scroll', function () {
        if ($(this).scrollTop() > 300) {
            $('#gotop').fadeIn("fast");
        } else {
            $('#gotop').stop().fadeOut("fast");
        }
    });

    // 图片点击在新标签页打开
    $('img:not(.noopen)').on('click', function () {
        if (this.src) {
            window.open(this.src);
        }
    })
});