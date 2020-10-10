const {encode, decode} = require('ic-xentity')

const readXML = (res, op) => {
	op = op || {}
	const trimSt = a => a.replace(/^[\x09-\x0d\x20\x85\xA0]+/, '')
	const isElement = a => (a = trimSt(a))[0] == '<' ? (a[1] == '/' ? 2 : 1) : 0

	// declaration remove
	res = res.replace(/<\?[^]*?\?>/g, '')
	// comments remove
	res = res.replace(/<\!--[^]*?\-->/g, '')

	const readElement = res => {
		res = trimSt(res)
		var name = /^<([^\x09-\x0d\x20\x85\xA0\/><?!]+)/.exec(res)
		if(!(name = name && name[1])) throw 'XML file is corrupted'
		res = res.substr(name.length + 1)
		var i = 0, empty = !1, attributes = {}, elements = [], value = undefined;
		while(i < res.length) {
			if(res[i].match(/[\x09-\x0d\x20\x85\xA0]/)) {
				i++
				continue
			}
			if(res[i] == '/') {
				if(res[i + 1] == '>') {
					i += 2
					empty = !0
					break
				}
				throw 'XML file is corrupted'
			}
			if(res[i] == '>') {
				i++
				break
			}
			if(res[i].match(/[\x01-\x25\x27-\x40\x5b-\x60\x7b-\x7f]/)) throw 'XML file is corrupted'
			var at = res.substr(i).match(/[^\x09-\x0d\x20\x85\xA0=\/'"><]+/)
			if((at = at[0])) {
				if(res[i + at.length] == '=') {
					var atchr = res[i + at.length + 1]
					if(atchr != '"' && atchr != "'") throw 'XML file is corrupted'
					var atval = res.substr(i + at.length).match(new RegExp(`=${atchr}[^]*?${atchr}`))
					atval = atval && atval[0]
					if(typeof atval != 'string') throw 'XML file is corrupted'
					i += at.length + atval.length
					atval = atval.substring(2, atval.length - 1)
					attributes[at] = decode(atval)
					continue
				}
				i += at.length
				attributes[at] = undefined
				continue
			}
			throw 'XML file is corrupted'
		}
		res = res.substr(i)
		var isElm = empty ? 2 : isElement(res)
		if(isElm == 0) {
			var val = new RegExp(`([^]*?)<\\/${name.replace(/[^a-z0-9]/gi, '\\$&')}>`).exec(res)
			i = (val && val[0].length) || 0
			val = val && val[1]
			if(typeof val != 'string') throw 'XML file is corrupted'
			res = res.substr(i)
			value = decode(val)
		}
		if(isElm == 1) {
			while(isElm == 1) {
				var el = readElement(res)
				res = el.res
				elements.push({name: el.name, attributes: el.attributes, elements: el.elements, value: el.value})
				isElm = isElement(res)
			}
			if(isElm == 0) throw 'XML file is corrupted'
			res = trimSt(res)
			var cls = `</${name}>`
			if(!res.startsWith(cls)) throw 'XML file is corrupted'
			res = res.substr(cls.length)
		}
		return {res, name, attributes, elements, value}
	}
	const parser = (el, op) => {
		op = op || {}
		const getval = a => {
			var b = /^(?:(true)|(false))$/.exec(a)
			if(op.boolean != 0 && b) return !!b[1]
			var n = /^[\d\-]/.exec(a) && /^-?[0-9.e+]+n?$/.exec(a)
			if(op.number != 0 && n) return a.match(/[.e]/g) ? parseFloat(a) : parseInt(a)
			var d = /^[\d]{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d(?:\.[\d]{3}(?:(?:\+|-)?(?:[\d]{4}|\d\d:\d\d))))?Z?)?$/g.exec(a)
			if(!d) d = /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat),? (?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d\d|\d\d (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)) [\d]{4}(?: \d\d:\d\d:\d\d(?: GMT(?:(?:\+|-)?(?:[\d]{4}|\d\d:\d\d))?)?)?$/i.exec(a)
			if(op.date != 0 && d) return new Date(a)
			return a
		}
		const prs = el => {
			Object.keys(el.attributes).forEach(a => el.attributes[a] = getval(el.attributes[a]))
			if(el.value) el.value = getval(el.value)
			el.elements = el.elements.map(a => prs(a))
			if(op.array == 1 && !el.elements.some(a => (a.elements && a.elements.length != 0) || (a.attributes && Object.keys(a.attributes).length != 0))) el.elements = el.elements.map(a => a.value)
			if(op.clean != 0) {
				if(typeof el.value == 'undefined') delete el.value
				if(Object.keys(el.attributes).length == 0) delete el.attributes
				if(el.elements.length == 0) delete el.elements
			}
			return el
		}
		return prs(el)
	}
	res = readElement(res)
	var c = a => {
		delete a.res
		a.elements = a.elements.map(b => c(b))
		return a
	}
	res = c(res)
	if(op.parser != 0) res = parser(res, op.parser)
	return res
}
const writeXML = (res, op) => {
	op = op || {}
	const _v = a => !!a || typeof a == 'number' || typeof a == 'string' || typeof a == 'boolean'
	const str = a => (a && a instanceof Date && a.toISOString()) || (_v(a) ? a.toString() : '')
	const wrEl = a => {
		if(!_v(a.name)) throw 'Tag name required'
		if((a.name = str(a.name)).match(/[\x09-\x0d\x20\x85\xA0\/><?!]/)) throw 'Tag name can not contain invalid characters'
		a.attributes = a.attributes || {}
		a.elements = a.elements || []
		var val = _v(a.value)
		var _a = val || !!a.elements.length
		return `<${a.name}${Object.keys(a.attributes).length ? ' ' : ''}${Object.keys(a.attributes).map(b => {
			if(b.match(/[\x09-\x0d\x20\x85\xA0\/><?!]/)) throw 'attribute name can not contain invalid characters'
			return `${b}="${encode(str(a.attributes[b]), {mode: 'predefined'})}"`
		}).join(' ')}${_a ? '' : '/'}>${!_a ? '' : (a.elements.length ? a.elements.map(b => wrEl(b)).join('') : encode(str(a.value), {mode: 'predefined'}))}${_a ? `</${a.name}>` : ''}`
	}
	return (op.declaration != 0 ? (typeof op.declaration == 'string' ? op.declaration : `<?xml version="1.0" encoding="UTF-8"?>`) : '') + wrEl(res)
}
const decoder = (data, op) => {
	op = op || {}
	const _r = d => {
		var v
		if((d.attributes || {})['data-type'] == 'array') v = d.elements.map(a => _r(a).v)
		else v = d.value || ((d.elements || []).length && reob(d)) || d.value
		return ({n: d.name, v})
	}
	const reob = d => {
		var r = {}
		d.elements.forEach(a => {
			var b = _r(a)
			r[b.n] = b.v
		})
		return r
	}
	return reob(op.raw ? data : readXML(data))
}
const encoder = (data, op) => {
	op = op || {}
	const wrob = d => {
		const _w = d => {
			var r = {}
			if(d && typeof d == 'object') {
				if(d instanceof Array) {
					r.attributes = r.attributes || {}
					r.attributes['data-type'] = 'array'
					r.elements = d.map(a => ({name: 'item', ..._w(a)}))
				}
				else r.elements = wrob(d)
			}
			else r.value = d
			return r
		}
		return Object.keys(d).map(a => ({name: a, ..._w(d[a])}))
	}
	var d = wrob({[op.baseName || 'data']: data})[0]
	return op.raw ? d : writeXML(d)
}
const XML = (data, op) => typeof data == 'string' ? decoder(data, op) : encoder(data, op)

exports.readXML = readXML
exports.writeXML = writeXML
exports.decoder = decoder
exports.encoder = encoder
exports.XML = XML
