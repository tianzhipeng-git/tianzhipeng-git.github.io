## 说明 
License Available under [the MIT license](http://mths.be/mit).

Fork from [flat theme](https://github.com/erming/jsonresume-theme-flat)

## 使用
安装: npm install
serve: npm run start




//encrypt
origin = $("body").innerHTML.trim()
ciphertext = CryptoJS.AES.encrypt(origin, 'secret').toString();
copy(ciphertext)

// decrypt
<script>
	var secret = undefined;
	while (!secret) {
		secret = window.prompt("已加密, 请输入秘钥(c2VjcmV0)")
	}
	var content = document.getElementsByTagName("body")[0].innerHTML.trim()
	var bytes = CryptoJS.AES.decrypt(content, secret);
	var originalText = bytes.toString(CryptoJS.enc.Utf8);
	document.getElementsByTagName("body")[0].innerHTML = originalText;
</script>