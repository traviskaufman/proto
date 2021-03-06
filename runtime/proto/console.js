var consoleLog = getConsoleMethod('log'),
	consoleError = getConsoleMethod('error'),
	consoleWarn = getConsoleMethod('warn'),

	console = CreatePrototype({

		log: function log(/* ...values */) {
			ExpectObject(this);
			if (this !== console && !IsLike(this, console))
				throw new TypeError('Console object expected');
			CallConsoleMethod(consoleLog, arguments);
		},

		error: function error(/* ...values */) {
			ExpectObject(this);
			if (this !== console && !IsLike(this, console))
				throw new TypeError('Console object expected');
			CallConsoleMethod(consoleError, arguments);
		},

		warn: function warn(/* ...values */) {
			ExpectObject(this);
			if (this !== console && !IsLike(this, console))
				throw new TypeError('Console object expected');
			CallConsoleMethod(consoleWarn, arguments);
		}

	});

function getConsoleMethod(name) {
	if (Object(global.console) !== global.console)
		return NOOP;
	var f = global.console[name];
	if (typeof f != 'function')
		return NOOP;
	return tie(f, global.console)
}

function CallConsoleMethod(f, values) {
	var args = create(null),
		value;
	args.length = 0;
	for (var i = 0; i < values.length; i++) {
		value = values[i];
		if (IsWrapper(value))
			push(args, value.Value);
		else if (value == null)
			push(args, '[nil]');
		else
			push(args, value);
	}
	f(args);
}