const {encode, decode} = require('ic-xentity')

const readXML = (res, op) => {
	op = op || {}
	const trimSt = a => a.replace(/^[\x09-\x0d\x20\x85\xA0]+/, '')
	const isElement = a => (a = trimSt(a))[0] == '<' ? (a[1] == '/' ? 2 : 1) : 0

	// declaration remove
	res = res.replace(/<\?[^]*?\?>/g, '')
	// comments remove
	if(!op.comments) res = res.replace(/<\!--[^]*?\-->/g, '')
	// CDATA
	res = res.replace(/<\!\[CDATA\[([^]*?)\]\]>/, (a,b) => encode(b))

	const readElement = res => {
		res = trimSt(res)
		var name = /^<([^\x00-\x2C\/\x3B-\x40\x5B-\x5E`\x7B-\x7E\x85\xA0]+)/.exec(res),
		i = 0, empty = !1, attributes = {}, elements = [], value = undefined, type
		if(!(name = name && name[1])) {
			if(op.comments && (name = /^<!--([^]*?)-->/.exec(res)) && name[1]) return {res: res.substr(name[0].length), name: '', type: 'comment', attributes, elements, value: name[1].trim()}
			throw new Error('invalid data at xml file')
		}
		res = res.substr(name.length + 1)
		while(i < res.length) {
			if(res[i].match(/[\x09-\x0d\x20\x85\xA0]/)) {
				i++
				continue
			}
			if(res[i] == '/' && res[i + 1] == '>') {
				i += 2
				empty = !0
				type = 'self-closing'
				break
			}
			if(res[i] == '>') {
				i++
				break
			}
			if(res[i].match(/[\x01-\x25\x27-\x40\x5b-\x60\x7b-\x7f]/)) throw new Error('invalid data at tag "' + name + '"')
			var at = res.substr(i).match(/[^\x09-\x0d\x20\x85\xA0=\/'"><]+/)
			if((at = at[0])) {
				if(res[i + at.length] == '=') {
					var atchr = res[i + at.length + 1]
					if(atchr != '"' && atchr != "'") throw new Error('invalid attribute at tag "' + name + '"')
					var atval = res.substr(i + at.length).match(new RegExp(`=${atchr}[^]*?${atchr}`))
					atval = atval && atval[0]
					if(typeof atval != 'string') throw new Error('invalid attribute at tag "' + name + '"')
					i += at.length + atval.length
					atval = atval.substring(2, atval.length - 1)
					attributes[at] = decode(atval)
					continue
				}
				i += at.length
				attributes[at] = undefined
				continue
			}
			throw new Error('invalid data at tag "' + name + '"')
		}
		res = res.substr(i)
		var isElm = empty ? 3 : isElement(res)
		if(isElm == 0 || isElm == 2) {
			var val = new RegExp(`([^]*?)<\\/${name.replace(/[^a-z0-9]/gi, '\\$&')}>`).exec(res)
			i = (val && val[0].length) || 0
			val = val && val[1]
			if(typeof val != 'string') throw new Error('invalid end of tag "' + name + '"')
			res = res.substr(i)
			value = decode(val)
		}
		if(isElm == 1) {
			while(isElm == 1) {
				var el = readElement(res)
				res = el.res
				elements.push({name: el.name, attributes: el.attributes, elements: el.elements, value: el.value, type: el.type})
				isElm = isElement(res)
			}
			if(isElm == 0) throw new Error('cannot found end tag of "' + name + '"')
			res = trimSt(res)
			var cls = `</${name}>`
			if(!res.startsWith(cls)) throw new Error('invalid end tag of "' + name + '"')
			res = res.substr(cls.length)
		}
		return {res, name, attributes, elements, value, type}
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
				;['value', 'type'].forEach(a => typeof el[a] == 'undefined' ? delete el[a] : 0)
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
	const str = a => (a && a instanceof Date && a.toISOString()) || (typeof a != 'undefined' && a !== null ? a : '').toString()
	const err = a => a.match(/[\x00-\x2C\/\x3B-\x40\x5B-\x5E`\x7B-\x7E\x85\xA0]/) || a.match(/^(\d|-|\.)/)
	const wrEl = a => {
		if(!(a.name = str(a.name))) {
			if(a.type == 'comment') return op.nocomments ? '' : `<!-- ${str(a.value).replace(/-->/g, a => '_')} -->`
			throw new Error('Tag names required')
		}
		if(err(a.name = str(a.name))) throw new Error('Tag names can not contain invalid characters')
		if(a.name.match(/^\d/)) throw new Error('Tag names cannot starts with numbers')
		a.attributes = a.attributes || {}
		a.elements = a.elements || []
		var _a = str(a.value) || !!a.elements.length,
		_b = op.noselfauto ? a.type != 'self-closing' : _a
		return `<${a.name}${Object.keys(a.attributes).length ? ' ' : ''}${Object.keys(a.attributes).map(b => {
			if(err(b)) throw new Error('attribute names can not contain invalid characters')
			return `${b}="${encode(str(a.attributes[b]), {mode: 'predefined'})}"`
		}).join(' ')}${_b ? '' : '/'}>${!_a ? '' : (a.elements.length ? a.elements.map(b => wrEl(b)).join('') : encode(str(a.value), {mode: 'predefined'}))}${_b ? `</${a.name}>` : ''}`
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
