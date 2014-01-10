#!/usr/bin/env node

var fs = require('fs'),
	path = require('path'),
	program = require('commander'),
	proto = require('../lib/proto'),
	file;

program
	.usage('[file]')
	.parse(process.argv);

file = path.resolve(process.cwd(), program.args.shift());

(0, eval)(
	'(function(require) {'
		+ proto.compile(fs.readFileSync(file), path.dirname(file), true)
	+ '})'
)(require);