$(function () {
    String.prototype.hashCode = function () {
        for (var ret = 0, i = 0, len = this.length; i < len; i++) {
            ret = (31 * ret + this.charCodeAt(i)) << 0;
        }
        return ret;
    };
    var _hmt = _hmt || [];
    (function () {
        var hm = document.createElement("script");
        hm.src = "https://hm.baidu.com/hm.js?5c3649ca110d768aa09517fcece1a8d3";
        var s = document.getElementsByTagName("script")[0];
        s.parentNode.insertBefore(hm, s);
    })();

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
    $('img').on('click', function () {
        if (this.src) {
            window.open(this.src);
        }
    })
});