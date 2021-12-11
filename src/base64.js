/**
  * Encoder/Decoder class
  * (c) ASoft Ltd, 2009-2011 (http://asoft.ru)
  * Some ideas were taken from Base64 class borrowed from http://webtoolkit.info
  * Adapted for Webpack by Computerica
  *
  * Works fast in Mozilla/Chrome/Safari, and performance under IE is much better
  * than original Base64 encoder/decoder
  **/
import bowser from 'bowser'

var Encoder = {
	sKeyStr_: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
	bInitialized_: false,
	
	initialize: function() {
		if (!this.bInitialized_) {
			// perform initialization
			this.aHashTab_ = new Array();
			for (var i = 0; i < this.sKeyStr_.length; ++i) {
				var c = this.sKeyStr_.charCodeAt(i);
				this.aHashTab_[c] = i; // store char index
			}
			this.bInitialized_ = true;
		}
	},

	Base64Encode: function (sInput) {
		// If available, use Mozilla/Safari/Chrome fast native base64 encoder
		if (typeof(btoa) != "undefined") return btoa(sInput);
		
		// ensure hash table is initialized
		this.initialize();
		var aOut = new Array();
		var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
		var i = 0;
		var di = 0;
		var len = sInput.length;
		while (i < len) {
			chr1 = sInput.charCodeAt(i++);
			chr2 = sInput.charCodeAt(i++);
			chr3 = sInput.charCodeAt(i++);

			enc1 = chr1 >> 2;
			enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
			enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
			enc4 = chr3 & 63;

			if (isNaN(chr2)) {
				enc3 = enc4 = 64;
			} else if (isNaN(chr3)) {
				enc4 = 64;
			}
			aOut[di++] = this.sKeyStr_.charAt(enc1);
			aOut[di++] = this.sKeyStr_.charAt(enc2);
			aOut[di++] = this.sKeyStr_.charAt(enc3);
			aOut[di++] = this.sKeyStr_.charAt(enc4);
		}
		return aOut.join('');
	},

	// public method for decoding
	Base64Decode: function (sInput) {
		// If available, use Mozilla/Safari/Chrome fast native decoder
		if (typeof(atob) != "undefined") return atob(sInput);
		
		// ensure hash table is initialized
		this.initialize();
		var aOut = new Array();
		var chr1, chr2, chr3;
		var enc1, enc2, enc3, enc4;
		var i = 0;
		sInput = sInput.replace(/[^A-Za-z0-9\+\/\=]/g, "");
		
		var len = sInput.length;
		var di = 0;
		while (i < len) {
			enc1 = this.aHashTab_[sInput.charCodeAt(i++)];
			enc2 = this.aHashTab_[sInput.charCodeAt(i++)];
			enc3 = this.aHashTab_[sInput.charCodeAt(i++)];
			enc4 = this.aHashTab_[sInput.charCodeAt(i++)];
			
			chr1 = (enc1 << 2) | (enc2 >> 4);
			chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
			chr3 = ((enc3 & 3) << 6) | enc4;
				
			aOut[di++] = String.fromCharCode(chr1);
			if (enc3 != 64) {
				aOut[di++] = String.fromCharCode(chr2);
			}
			if (enc4 != 64) {
				aOut[di++] = String.fromCharCode(chr3);
			}
		}
		return aOut.join('');
	},

	UTF8Encode: function(sString) {
		//sString = sString.replace(/\r\n/g,"\n");
		var len = sString.length;
		if (bowser.msie) {
			var aBytes = new Array();
			var di = 0;
			for (var n = 0; n < len; ++n) {
				var c = sString.charCodeAt(n);
				if (c < 128) {
					aBytes[di++] = String.fromCharCode(c);
				} else if((c > 127) && (c < 2048)) {
					aBytes[di++] = String.fromCharCode((c >> 6) | 192);
					aBytes[di++] = String.fromCharCode((c & 63) | 128);
				} else {
					aBytes[di++] += String.fromCharCode((c >> 12) | 224);
					aBytes[di++] += String.fromCharCode(((c >> 6) & 63) | 128);
					aBytes[di++] += String.fromCharCode((c & 63) | 128);
				}
			}
			return aBytes.join('');
		} else {
			var sBytes = "";
			for (var n = 0; n < len; ++n) {
				var c = sString.charCodeAt(n);
				if (c < 128) {
					sBytes += String.fromCharCode(c);
				} else if ((c > 127) && (c < 2048)) {
					sBytes += String.fromCharCode((c >> 6) | 192);
					sBytes += String.fromCharCode((c & 63) | 128);
				} else {
					sBytes += String.fromCharCode((c >> 12) | 224);
					sBytes += String.fromCharCode(((c >> 6) & 63) | 128);
					sBytes += String.fromCharCode((c & 63) | 128);
				}
			}
			return sBytes;
		}
	},

	UTF8Decode: function (sBytes) {
		var i = 0;
		var c1 = 0;
		var c2 = 0;
		var c3 = 0;
		var len = sBytes.length;
		
		if (bowser.msi) {
			// Use array join technique
			var aOut = new Array();
			var di = 0;
			while (i < len ) {
				c1 = sBytes.charCodeAt(i);
				if (c1 < 128) {
					aOut[di++] = String.fromCharCode(c1);
					i++;
				}
				else if ((c1 > 191) && (c1 < 224)) {
					c2 = sBytes.charCodeAt(i+1);
					aOut[di++] = String.fromCharCode(((c1 & 31) << 6) | (c2 & 63));
					i += 2;
				}
				else {
					c2 = sBytes.charCodeAt(i+1);
					c3 = sBytes.charCodeAt(i+2);
					aOut[di++] = String.fromCharCode(((c1 & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
					i += 3;
				}
			}
			return aOut.join('');
		} else {
			// Use standard += operator technique
			var sOut = "";
			while (i < len ) {
				c1 = sBytes.charCodeAt(i);
				if (c1 < 128) {
					sOut += String.fromCharCode(c1);
					i++;
				}
				else if ((c1 > 191) && (c1 < 224)) {
					c2 = sBytes.charCodeAt(i+1);
					sOut += String.fromCharCode(((c1 & 31) << 6) | (c2 & 63));
					i += 2;
				}
				else {
					c2 = sBytes.charCodeAt(i+1);
					c3 = sBytes.charCodeAt(i+2);
					sOut += String.fromCharCode(((c1 & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
					i += 3;
				}
			}
			return sOut;
		}
	}
}

export default Encoder;
