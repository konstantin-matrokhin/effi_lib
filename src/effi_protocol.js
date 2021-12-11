import Encoder from './base64.js'
import ajax from '@fdaciuk/ajax'

if (typeof String.prototype.startsWith != 'function') {
	String.prototype.startsWith = function (str) {
		return this.indexOf(str) === 0;
	};
}

if (!Array.isArray) {
	Array.isArray = function(arg) {
		return Object.prototype.toString.call(arg) === '[object Array]';
	};
}
function isObject(obj) {
   return Object.prototype.toString.call(obj) === '[object Object]';
}


let parseXml;

if (typeof window.DOMParser != "undefined") {
    parseXml = function(xmlStr) {
        return ( new window.DOMParser() ).parseFromString(xmlStr, "text/xml");
    };
} else if (typeof window.ActiveXObject != "undefined" &&
       new window.ActiveXObject("Microsoft.XMLDOM")) {
    parseXml = function(xmlStr) {
        var xmlDoc = new window.ActiveXObject("Microsoft.XMLDOM");
        xmlDoc.async = "false";
        xmlDoc.loadXML(xmlStr);
        return xmlDoc;
    };
} else {
    throw new Error("No XML parser found");
}


function EffiProtocol(opts) {
	opts = opts || {};
	this.login = opts.login || 'barn';
	this.password = opts.password || (this.login == 'barn' ? 'barn' : '');
	this.language = 'ru_RU';
	this.host = opts.host || '';
	this.authenticated = false;
	this.event_subscribers = [];
	this.logout_subscribers = [];
	this.polling = false;

	var context = this;

	function parseStructure(obj) {
		var result = {};
		for (var i=0; i<obj.children.length; i+=2) {
			var key = obj.children[i].textContent,
				value = parseValue(obj.children[i+1]);
			result[key] = value;
		}
		return result;
	}

	function parseArray(obj) {
		var result = [];
		for (var i=0; i<obj.children.length; i++) {
			result[i] = parseValue(obj.children[i]);
		}
		return result;
	}

	function parseException(obj) {
		let result = {
			ExceptionText: "",
			ErrorCode: undefined
		};
		if (obj.children.length < 1) return result;
		result.ExceptionText = obj.children[0].textContent;
		if (obj.children.length > 1) result.ErrorCode = parseValue(obj.children[1]);
		return result;
	}

	function parseTime(val) {
		let found = val.match(/(\d\d\d\d)(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)/);
		if (found != null) {
			return new Date(parseInt(found[1]), parseInt(found[2])-1, parseInt(found[3]), parseInt(found[4]), parseInt(found[5]), parseInt(found[6]));
		}
		return null;
	}
	function parseDate(val) {
		let found = val.match(/(\d\d\d\d)(\d\d)(\d\d)/);
		if (found != null) {
			return new Date(parseInt(found[1]), parseInt(found[2])-1, parseInt(found[3]));
		}
		return null;
	}

	function parseValue(obj) {
		if (obj == null || null == obj.children[0]) return null;
		let container = obj.children[0];
		let nodeName = container.nodeName.toUpperCase();
		if (nodeName == 'STRUCTURE') return parseStructure(container);
		else if (nodeName == 'ARRAY') return parseArray(container);
		else if (nodeName == 'UL' || nodeName == 'OPTIONAL' || nodeName == 'U') return parseValue(container);
		else if (nodeName == 'INT64_T' || nodeName == 'INT') return parseInt(container.textContent);
		else if (nodeName == 'TIME') return parseTime(container.children[0].textContent);
		else if (nodeName == 'ADATE') return parseDate(container.children[0].textContent);
		else if (nodeName == 'DECIMAL') return parseFloat(container.textContent);
		else if (nodeName == 'DOUBLE') return parseFloat(container.textContent);
		else if (nodeName == 'EXCEPTION') return parseException(container);
		else if (nodeName == 'VALUE') return parseValue(container);
		else return container.textContent;
		return null;
	}

	function parseAXML(data) {
		var apacket_re = /APacket\(\d+ ,"","","","","",\{"ResponseTo":ul\(0 \)\},(.*)\)/;
		var result = data,
			$xml = parseXml(data);
		if (data.startsWith('APacket')) {
			result = result.replace(apacket_re, '$1');
		}

		// var values = $xml.select('APacket > Value');
		let values = $xml.evaluate( '//APacket/Value', $xml, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
		if (!values || values.snapshotLength == 0) {
			if ($xml.children.length < 1) return;
			return parseValue($xml.children[0]);
		}
		let content = values.snapshotItem(values.snapshotLength-1);
		return parseValue(content);
	}

	function _parse(data, xhr) {
		var ct = xhr.getResponseHeader("content-type") || "";
		var res = data;
		if (ct.indexOf('text/xml') > -1) {
			res = parseAXML(data);
		}
		else if (ct.indexOf('application/json') > -1) {
			res = JSON.parse(data);
		}
		return res;
	}
	
	this.auth = function(opts) {
		let login = opts.login || context.login,
			password = opts.password || context.password,
			lang = opts.lang || 'ru_RU',
			skin = opts.skin || 'materio',
			time_zone = opts.time_zone || new Date().getTimezoneOffset();
		return new Promise((resolve, reject) => {
			let request = ajax({
				url: context.host + '/auth/login', 
				method: 'POST',
				dataType: 'text',
				data: `Login=s:${login}&Password=s:${password}&Lang=s:${lang}&Skin=s:${skin}&TimeZone=i:${time_zone}&`
			})
			.then((resp) => {
				var res = parseAXML(resp);
				context.authenticated = true;
				context.login = login;
				context.password = password;
				if (typeof res == 'string') context.language = res;
				if (typeof opts.success != 'undefined') opts.success(context.language, res);
				resolve(context.language, res);
			})
			.catch((resp) => {
				var responseError = parseAXML(resp);
				console.error(responseError.ErrorCode, responseError.ExceptionText);
				if (typeof opts.error != 'undefined') opts.error(responseError);
				reject(responseError);
			});
		});
	}

	this.request = function (opts) {
		return new Promise((resolve, reject) => {
			let data = opts.data || "dummy=none:&";
			ajax()
				.post(context.host + opts.url, data)
				.then((resp, xhr) => {
					let res = _parse(resp, xhr);
					if (typeof opts.success != 'undefined') opts.success(res);
					resolve(res);
				})
				.catch((resp, xhr) => {
					var responseError = parseAXML(resp);
					console.error(responseError.ErrorCode, responseError.ExceptionText);
					if (responseError.ErrorCode == 101 || responseError.ErrorCode == 100) {
						context.auth({
							success: () => {
								context.request(opts)
									.then((res) => { resolve(res); })
									.catch((err) => { reject(err); })
							},
							error: () => {
								context.fireLogout();
							}
						});
					}
					else {
						if (typeof opts.error  != 'undefined') opts.error(responseError);
						reject(responseError);
					}
				});
		});
	}

	this.onLogout = function (caller)  {
		if (typeof caller != 'function') throw "EffiProtocol.onLogout: argument is not a function. ";
		this.logout_subscribers.push(caller);
	}
	this.fireLogout = function () {
		for (let i=0; i<=this.logout_subscribers.length; i++) {
			let caller = this.logout_subscribers[i];
			caller(this);
		}
	}

	this.pollEvents = function (cnt) {
		cnt = cnt || 0;
		this.polling = true;
		ajax(context.host + '/srv/WWW/WWWWorker/GetEvent')
			.get()
			.then(function (data) {
				context.eventsTimeout = setTimeout(() => {context.pollEvents(1)}, 1);
				let res = parseAXML(data);
				// console.log('event success:', res);
				for (let e=0; e<res.length; e++) {
					let event =  res[e];
					// console.log(context.event_subscribers)
					for (let i=0; i<context.event_subscribers.length; i++) {
						let subscr = context.event_subscribers[i];
						if (!subscr.type || subscr.type == '*' || subscr.type == event.Type) {
							subscr.callback(event);
						}
					}
				}
			})
			.catch(function (resp, xhr) {
				var responseError = parseAXML(resp);
				if (!responseError) {
					if (cnt<4) {
						context.eventsTimeout = setTimeout(() => {context.pollEvents(cnt+1)}, 2000);
					} else {
						clearTimeout(context.eventsTimeout);
						console.error("Connection to server lost. ");
					}
					return;
				}
				console.error(cnt, responseError.ErrorCode, responseError.ExceptionText);
				if (cnt<4 && (responseError.ErrorCode == 101 || responseError.ErrorCode == 100)) {
					context.auth({
						success: () => {
							console.log('auth done')
							context.pollEvents(1);
						}	
					});
				}
				else {
					clearTimeout(context.eventsTimeout);
					console.error("Connection to server lost. ");
					throw responseError;
				}
			});
	}

	this.subscribe = function (ctx, event_name, callback) {
		if (typeof (event_name) == 'function') {
			event_name = '*';
			callback = event_name;
		}
		context.event_subscribers.push({ctx: ctx, type: event_name, callback: callback});
		if (!context.polling) {
			if (typeof SubscribeOnEvent !== 'undefined') {
				// console.log('current window SubscribeOnEvent');
				SubscribeOnEvent(event_name, "document", context.processPrototypeEvent, context);
				context.polling = true;
			}
			else if (typeof window.opener !== 'undefined' && window.opener && typeof window.opener.SubscribeOnEvent !== 'undefined') {
				// console.log('parent window SubscribeOnEvent');
				window.opener.SubscribeOnEvent(event_name, "document", context.processPrototypeEvent, context);
				context.polling = true;
			}
			else {
				// console.log('separate window');
				context.eventsTimeout = setTimeout(() => {context.pollEvents(1)}, 1);
			}
		}
	}
	this.unsubscribe = function (ctx, event_name) {
		// console.log('unsubscribe', ctx, event_name)
		for (let i=0; i<this.event_subscribers.length; i++) {
			let subscr = this.event_subscribers[i];
			if (subscr.ctx == ctx && (!event_name || event_name == '*' || event_name == subscr.type)) {
				// console.log('  drop subscriber', subscr);
				this.event_subscribers.splice(i, 1);
			}
		}
		// if (UnsubscribeFromEvent) {
		// 	UnsubscribeFromEvent(event_name, "document", this.processPrototypeEvent, this)
		// }
	}

	this.normalizePrototypeObject = function(obj) {
		let res = {}
		for (let k in obj) {
			if (typeof obj[k] == 'object') {
				if ('oValue_' in obj[k]) {
					res[k] = obj[k].oValue_;
					if (typeof obj[k].oValue_ == 'object' && 'value_' in obj[k].oValue_) res[k] = obj[k].oValue_.value_;
				}
				// else if ('value_' in obj[k]) res[k] = obj[k].value_
				else res[k] = null;
			}
			else res[k] = obj[k];
		}
		return res;
	}
	this.processPrototypeEvent = function(e) {
		let event_data = this.normalizePrototypeObject(e.oEventData_),
			event = {Type: e.sEventName_, Data: event_data};
		for (let i=0; i<context.event_subscribers.length; i++) {
			let subscr = context.event_subscribers[i];
			if (!subscr.type || subscr.type == '*' || subscr.type.toUpperCase() == e.sEventName_) {
				subscr.callback(event);
			}
		}
	}

	function delete_cookie(name) {
		document.cookie = name +'=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
	}

	this.logout = function () {
		clearTimeout(context.eventsTimeout);
		delete_cookie('_1024_sid');
		this.authenticated = false;
	}
}

function paddy(n, p, c) {
	var pad_char = typeof c !== 'undefined' ? c : '0';
	var pad = new Array(1 + p).join(pad_char);
	return (pad + n).slice(-pad.length);
}
function format_effi_date(date) {
	if (date == null) return 'not-a-date';
	return paddy(date.getFullYear(), 4) + paddy(date.getMonth()+1, 2) + paddy(date.getDate(), 2);
}
function format_effi_time(date) {
	if (date == null) return 'not-a-date-time';
	return paddy(date.getFullYear(), 4) + paddy(date.getMonth()+1, 2) + paddy(date.getDate(), 2) + 'T' + 
		paddy(date.getHours(), 2) + paddy(date.getMinutes(), 2) + paddy(date.getSeconds(), 2);
}

function encodeAURLComponent(obj) {
	var serialized = '';
	if (typeof obj == 'undefined' || obj == null) return 'none:&'
	else if (obj.type == 'array' || Array.isArray(obj)) {
		let s = '';
		for (let i=0; i<obj.length; i++) {
			let o = obj[i];
			s += encodeAURLComponent(o);
		}
		serialized += 'Value:Array:' + s + '&&';
	}
	else if (obj.type == 'optionalInt') serialized = 'optional:i:' + obj.value + '&&';
	else if (obj.type == 'float' || typeof obj.value == 'float') serialized = 'd:' + obj.value + '&';
	else if (obj.type == 'int' || typeof obj.value == 'number') serialized = 'i:' + obj.value + '&';
	else if (obj.type == 'date' || obj.type == 'ADate') serialized = 'ADate:s:' + format_effi_date(obj.value) + '&&';
	else if (obj.type == 'datetime' || obj.type == 'Time' || obj.value instanceof Date) serialized = 'Time:s:' + format_effi_time(obj.value) + '&&';
	else if (obj.type == 'checkbox') serialized = 's:' + obj.value + '&';
	else if (obj.type == 'optionalString') serialized = 'optional:s:' + obj.value.replace(/ /g, '\\w') + '&&';
	else if (obj.type == 'binary') serialized = 'b:' + Encoder.Base64Encode(Encoder.UTF8Encode(obj.value)) + '&';
	else {
		let v = ((typeof obj.value == 'undefined') ? obj : obj.value);
		serialized = 's:' + v.replace(/ /g, '\\w') + '&';
	}
	return serialized;
}

function encodePlain(obj) {
	let serialized = '';
	if (typeof obj == 'undefined' || obj == null) return 'none:&'
	else if (obj.type == 'optionalInt') serialized = 'optional:i:' + obj.value + '&&';
	else if (obj.type == 'float' || typeof obj.value == 'float') serialized = 'd:' + obj.value + '&';
	else if (obj.type == 'int' || typeof obj.value == 'number') serialized = 'i:' + obj.value + '&';
	else if (obj.type == 'date' || obj.type == 'ADate') serialized = 'ADate:s:' + format_effi_date(obj.value) + '&&';
	else if (obj.type == 'datetime' || obj.type == 'Time' || obj.value instanceof Date) serialized = 'Time:s:' + format_effi_time(obj.value) + '&&';
	else if (obj.type == 'checkbox') serialized = 's:' + obj.value + '&';
	else if (obj.type == 'optionalString') serialized = 'optional:s:' + obj.value.replace(/ /g, '\\w') + '&&';
	else if (obj.type == 'binary') serialized = 'b:' + Encoder.Base64Encode(obj.value) + '&';
	else {
		let v = ((typeof obj.value == 'undefined') ? obj : obj.value);
		serialized = 's:' + v.replace(/ /g, '\\w') + '&';
	}
	return serialized;
}
function encodeBlob(file, callback) {
	var reader = new FileReader();

	reader.onload = function(readerEvt) {
		console.log('loaded file size=' + readerEvt.target.result.length);
		let serialized = 'b:' + Encoder.Base64Encode(readerEvt.target.result) + '&';
		callback(serialized);
	};

	reader.readAsBinaryString(file);
}
function encodeBlobFile(file, callback) {
	encodeBlob(file, function(serialized_blob) {
		let serialized = 'BlobFile:' + 
			encodeAURLComponent({value: file.name, type: 'string'}) +
			encodeAURLComponent({value: file.type, type: 'string'}) +
			serialized_blob +
			encodeAURLComponent(null) +
			encodeAURLComponent({value: file.lastModifiedDate, type: 'Time'}) + 
			'&';
		callback(serialized);
	});
}

function reduceSerializationArray(serialized, array, i, callback) {
	if (array.length == 0) {
		callback(serialized);
		return;
	}
	let obj = array.splice(0, 1);
	encodeAURLComponentAsync(serialized, obj, function(v) {
		reduceSerializationArray(v, array, ++i, callback);
	});
}
function reduceSerializationStructure(serialized, array, object, i, callback) {
	if (array.length == 0) {
		callback(serialized);
		return;
	}
	let key = array.splice(0, 1);
	let obj = object[key];
	let s = serialized + key + '=';
	encodeAURLComponentAsync(s, obj, function (v) {
		reduceSerializationStructure(v, array, object, ++i, callback);
	});
}

function encodeAURLComponentAsync(serialized, obj, callback) {
	// console.log(obj);
	if (obj.type == 'BlobFile' || obj.value instanceof File) {
		encodeBlobFile(obj.value, function (serialized_file) {
			callback(serialized + serialized_file);
		});
	}
	else if (obj.type == 'Array' || Object.prototype.toString.call(obj) === '[object Array]') {
		let o = obj.value || obj;
		reduceSerializationArray(serialized + 'Value:Array:', o, 0, function (v) {
			callback(v + '&&')
		});
	}
	else if (obj.type == 'Structure') {
		let keys = [];
		for (let k in obj.value) keys.push(k);
		let s = serialized + 'Value:Structure:';
		reduceSerializationStructure(s, keys, obj.value, 0, function (v) {
			callback(v + '&&')
		});
	}
	else {
		let s3 = encodePlain(obj);
		callback(serialized + s3);
	}
}

function serializeAURL(a) {
	var result = '';
	for (var key in a) {
		var o = a[key];
		result += key + "=" + encodeAURLComponent(o);
	}
	return result;
};
function serializeAURLAsync(a, callback) {
	let keys = [];
	for (let k in a) keys.push(k);
	reduceSerializationStructure('', keys, a, 0, callback);
}

function prepareDataList(data) {
	if (!data || data.length == 0) throw "Invalid DataList argument. ";
	const header = data[0];
	let result = {
		header: header,
		data: []
	};
	for (let i=1; i<data.length; i++) {
		let r = data[i],
			row = {};
		for (let c=0; c<r.length; c++) {
			row[header[c]] = r[c];
		}
		result.data.push(row);
	}
	return result;
}

/*
jQuery.fn.extend({
	serializeAURL: function() {
		return serializeAURL( this.serializeTypedArray() );
	},
	serializeTypedArray: function() {
		var rCRLF = /\r?\n/g,
			rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
			rsubmittable = /^(?:input|select|textarea|keygen)/i,
			rcheckableType = /^(?:checkbox|radio)$/i;
		
		function getv(val, type, isArray) {
			type = type || 'string';
			var v = "";
			if (type == 'date') {
				var found = val.match(/(\d\d)\.(\d\d)\.(\d\d\d\d)( (\d\d):(\d\d)(:(\d\d))?)?/);
				if (found != null) {
					// var h = found[5] ? parseInt(found[5]) : undefined, 
					// 	m = found[6] ? parseInt(found[6]) : undefined, 
					// 	s = found[8] ? parseInt(found[8]) : undefined;
					v = new Date(parseInt(found[3]), parseInt(found[2])-1, parseInt(found[1]));
					// console.log(parseInt(found[3]), parseInt(found[2])-1, parseInt(found[1]), h, m, s, '->', v);
				}
				else v = null;
			}
			// else if (type == 'checkbox') 
			else if (type == 'int') v = parseInt(val);
			else if (type == 'checkbox' && !isArray) {
				v = (val == 'on' ? true : false);
			}
			else v = val.replace( rCRLF, "\r\n" );
			return v;
		}

		var list = this.map(function() {
			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		})
		.filter(function() {
			var type = this.type;

			// Use .is( ":disabled" ) so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !rcheckableType.test( type ) );
		})
		.map(function( i, elem ) {
			var val = jQuery( this ).val(),
				type = jQuery( this ).attr('data-type') || this.type,
				isArray = jQuery( this ).attr('data-array') == 'true' || false;

			return val == null ?
				null :
				jQuery.isArray( val ) ?
					jQuery.map( val, function( val ) {
						return { name: elem.name, value: getv(val, type, isArray), type: type, isArray: isArray };
					}) :
					{ name: elem.name, value: getv(val, type, isArray), type: type, isArray: isArray };
		}).get();

		var s = {}
		for (var i=0; i<list.length; i++) {
			var o = list[i];
			if (o.isArray || o.name in s) {
				if (!(o.name in s)) s[o.name] = [o];
				else s[o.name].push(o);
			}
			else s[o.name] = o;
		}
		return s;
	}
});
*/

export { EffiProtocol, serializeAURL, serializeAURLAsync, format_effi_date, format_effi_time, prepareDataList };
