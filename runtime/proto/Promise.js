// This is based on https://github.com/domenic/promises-unwrapping
// commit ab245ff421075c6d8351a26c0f8b9e791bc7c76c

// TODO: Is ReturnIfAbrupt supposed to throw or ignore an exception?

var PromiseProto = CreatePrototype({

	init: function init(resolver) {
		ExpectFunction(resolver);
		PromiseInit(this, resolver);
	},

	then: function then(onFulfilled, onRejected) {
		return PromiseThen(this, onFulfilled, onRejected);
	},

	catch: function catch_(onRejected) {
		return PromiseThen(this, undefined, onRejected);
	},

	static_cast: function cast(value) {
		return CastToPromise(this, value);
	},

	static_all: function all(promises) {
		return PromiseAll(this, promises);
	}

});

function CastToPromise(P, x) {
	var proto, deferred;
	if (IsPromise(x)) {
		proto = getPrototypeOf(x);
		if (proto === P)
			return x;
	}
	deferred = GetDeferred(P);
	Call(deferred.Resolve, undefined, [ x ]);
	return deferred.Promise;
}

function GetDeferred(P) {
	var deferred, resolver, promise;
	ExpectObject(P);
	deferred = { Promise: undefined, Resolve: undefined, Reject: undefined };
	resolver = CreateDeferredConstructionFunction();
	resolver.Deferred = deferred;
	promise = New(P, [ resolver ]);
	ExpectFunction(deferred.Resolve);
	ExpectFunction(deferred.Reject);
	deferred.Promise = promise;
	return deferred;
}

function IsPromise(x) {
	if (!IsObject(x))
		return false;
	if (!('PromiseStatus' in x))
		return false;
	if (x.PromiseStatus === undefined)
		return false;
	return true;
}

function MakePromiseReactionFunction(deferred, handler) {
	var F = CreatePromiseReactionFunction();
	F.Deferred = deferred;
	F.Handler = handler;
	return F;
}

function PromiseReject(promise, reason) {
	var reactions;
	if (promise.PromiseStatus != 'unresolved')
		return;
	reactions = promise.RejectReactions;
	promise.Result = reason;
	promise.ResolveReactions = undefined;
	promise.RejectReactions = undefined;
	promise.PromiseStatus = 'has-rejection';
	TriggerPromiseReactions(reactions, reason);
}

function PromiseResolve(promise, resolution) {
	if (resolution === 523) debugger;
	var reactions;
	if (promise.PromiseStatus !== 'unresolved')
		return;
	reactions = promise.ResolveReactions;
	promise.Result = resolution;
	promise.ResolveReactions = undefined;
	promise.RejectReactions = undefined;
	promise.PromiseStatus = 'has-resolution';
	TriggerPromiseReactions(reactions, resolution);
}

function TriggerPromiseReactions(reactions, argument) {
	for (var i = 0; i < reactions.length; i++)
		(function(reaction) {
			QueueMicrotask(function() {
				Call(reaction, undefined, [ argument ]);
			});			
		})(reactions[i]);
}

function CreateDeferredConstructionFunction() {
	var F = CreateFunction(null, function(resolve, reject) {
		var deferred = F.Deferred;
		deferred.Resolve = resolve;
		deferred.Reject = reject;
	});
	return F;
}

function CreatePromiseAllCountdownFunction() {
	var F = CreateFunction(null, function(x) {
		var index = F.Index,
			values = F.Values,
			deferred = F.Deferred,
			countdownHolder = F.CountdownHolder;
		values[index] = x;
		if (values.length < index + 1)
			values.length = index + 1;
		countdownHolder.Countdown--;
		if (countdownHolder.Countdown == 0)
			return Call(deferred.Resolve, undefined, [
				CreateArray(undefined, values)
			]);
	});
	return F;
}

function CreatePromiseReactionFunction() {
	var F = CreateFunction(null, function(x) {
		var deferred = F.Deferred,
			handler = F.Handler,
			handlerResult,
			then;
		try { handlerResult = Call(handler, undefined, [ x ]); }
		catch (e) {
			Call(deferred.Reject, undefined, [ proxyJs(e) ]);
			return;
		}
		if (!IsObject(handlerResult)) {
			Call(deferred.Resolve, undefined, [ handlerResult ]);
			return;
		}
		if (handlerResult === deferred.Promise)
			Call(deferred.Reject, undefined, [
				new TypeError('Promise cannot resolve itself')
			]);
		if (IsPromise(handlerResult))
			PromiseThen(handlerResult, deferred.Resolve, deferred.Reject);
		else
			Call(deferred.Resolve, undefined, [ handlerResult ]);
	});
	return F;
}

function CreatePromiseResolutionHandlerFunction() {
	var F = CreateFunction(null, function(x) {
		var fulfillmentHandler = F.FulfillmentHandler,
			rejectionHandler = F.RejectionHandler;
		if (IsPromise(x))
			return PromiseThen(x, fulfillmentHandler, rejectionHandler);
		return Call(fulfillmentHandler, undefined, [ x ]);
	});
	return F;
}

function CreateRejectPromiseFunction() {
	var F = CreateFunction(null, function(reason) {
		var promise = F.Promise;
		return PromiseReject(promise, reason);
	});
	return F;
}

function CreateResolvePromiseFunction() {
	var F = CreateFunction(null, function(resolution) {
		var promise = F.Promise;
		return PromiseResolve(promise, resolution);
	});
	return F;
}

function PromiseInit(promise, resolver) {
	var resolve, reject;
	promise.PromiseStatus = 'unresolved';
	promise.ResolveReactions = create(null);
	promise.ResolveReactions.length = 0;
	promise.RejectReactions = create(null);
	promise.RejectReactions.length = 0;
	resolve = CreateResolvePromiseFunction();
	resolve.Promise = promise;
	reject = CreateRejectPromiseFunction();
	reject.Promise = promise;
	try { Call(resolver, undefined, [ resolve, reject ]); }
	catch (e) { PromiseReject(promise, proxyJs(e)); }
}

function PromiseAll(proto, iterable) {
	var deferred = GetDeferred(proto),
		iterator, values, index, next, nextPromise, countdownFunction, result,
		countdownHolder, nextValue;
	try { iterator = GetIterator(iterable); }
	catch (e) {
		PromiseReject(deferred.Promise, proxyJs(e));
		return deferred.Promise;
	}
	values = create(null);
	values.length = 0;
	countdownHolder = { Countdown: 0 };
	index = 0;
	while (true) {
		try { next = IteratorStep(iterator); }
		catch (e) {
			PromiseReject(deferred.Promise, proxyJs(e));
			return deferred.Promise;
		}
		if (next === false) {
			if (index == 0)
				Call(deferred.Resolve, undefined, [
					CreateArray(undefined, values)
				]);
			return deferred.Promise;
		}
		try { nextValue = IteratorValue(next); }
		catch (e) {
			PromiseReject(deferred.Promise, proxyJs(e));
			return deferred.Promise;
		}
		try { nextPromise = CastToPromise(proto, nextValue); }
		catch (e) {
			PromiseReject(deferred.Promise, proxyJs(e));
			return deferred.Promise;
		}
		countdownFunction = CreatePromiseAllCountdownFunction();
		countdownFunction.Index = index;
		countdownFunction.Values = values;
		countdownFunction.Deferred = deferred;
		countdownFunction.CountdownHolder = countdownHolder;
		try {
			result = PromiseThen(
				nextPromise, countdownFunction, deferred.Reject
			);
		} catch (e) {
			PromiseReject(deferred.Promise, proxyJs(e));
			return deferred.Promise;
		}
		index++;
		countdownHolder.Countdown++;
	}
}

function PromiseThen(promise, onFulfilled, onRejected) {
	if (!IsPromise(promise))
		throw new TypeError('Promise expected');
	var proto = getPrototypeOf(promise),
		deferred = GetDeferred(proto),
		rejectionHandler,
		fulfillmentHandler,
		resolutionHandler,
		resolveReaction,
		rejectReaction;
	rejectionHandler = deferred.Reject;
	if (onRejected !== undefined)
		rejectionHandler = ExpectFunction(onRejected);
	fulfillmentHandler = deferred.Resolve;
	if (onFulfilled !== undefined)
		fulfillmentHandler = ExpectFunction(onFulfilled);
	resolutionHandler = CreatePromiseResolutionHandlerFunction();
	resolutionHandler.FulfillmentHandler = fulfillmentHandler;
	resolutionHandler.RejectionHandler = rejectionHandler;
	resolveReaction = MakePromiseReactionFunction(deferred, resolutionHandler);
	rejectReaction = MakePromiseReactionFunction(deferred, rejectionHandler);
	if (promise.PromiseStatus === 'unresolved') {
		push(promise.ResolveReactions, resolveReaction);
		push(promise.RejectReactions, rejectReaction);
	}
	else if (promise.PromiseStatus === 'has-resolution')
		QueueMicrotask(function() {
			Call(resolveReaction, undefined, [ promise.Result ]);
		});
	else if (promise.PromiseStatus === 'has-rejection')
		QueueMicrotask(function() {
			Call(rejectReaction, undefined, [ promise.Result ]);
		});
	return deferred.Promise;
}

function QueueMicrotask(f) {
	setTimeout(f, 0);
}