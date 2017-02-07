import gutil from 'gulp-util'
import path from 'path'
import {spawn} from 'child_process'
import through2 from 'through2'

function once(fn) {
	let called = false
	return function (...args) {
		if (called) return
		called = true
		return fn(...args)
	}
}

function pipeBuffer(buff, stream, callback) {
	callback = once(callback)
	stream.on('error', callback)
	stream.on('drain', () => writeNext())
	writeNext()

	function writeNext() {
		if (buff.length == 0) {
			stream.end()
			callback()
			return
		}
		const keepGoing = stream.write(buff.slice(0, 256))
		buff = buff.slice(256)
		if (keepGoing)
			writeNext()
	}
}

module.exports = function docker(container, dest) {
	let errors = []
	return through2.obj(function write(file, enc, callback) {
		const done = once((err) => {
			if (err)
				errors.push(err)
			callback(null, file)
		})

		const rel = path.relative(file.base, file.path)
		const destFile = path.join(dest, rel)

		spawn('docker', ['exec', '-i', container, 'mkdir', '-p', path.dirname(destFile)])
		.on('error', e => done(e))
		.on('close', () => {
			const proc = spawn('docker', ['exec', '-i', container, 'sh', '-c', `cat > ${destFile}`], {stdin: 'pipe'})
			proc.on('close', code => done(code != 0 ? new Error(`Non-zero exit code: ${code}`) : null))
			proc.on('error', e => done(e))
			pipeBuffer(file.contents, proc.stdin, done)
		})
	}, function end(callback) {
		gutil.log('docker copy:', errors.length, 'errors:', errors.map(e => e.message).join(', '))
		errors = 0
		callback()
	})
}
