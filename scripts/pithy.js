$(function () {
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
});