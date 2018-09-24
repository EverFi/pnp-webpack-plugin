let pnp;

try {
  pnp = require(`pnpapi`);
} catch (error) {
  // not in PnP; not a problem
}

function nothing() {
  // ¯\_(ツ)_/¯
}

function getModuleLocator(module) {
  const moduleLocation = module.filename;

  if (!moduleLocation)
    throw new Error(`The specified module doesn't seem to exist on the filesystem`);

  const moduleLocator = pnp.findPackageLocator(moduleLocation);

  if (!moduleLocator)
    throw new Error(`the specified module doesn't seem to be part of the dependency tree`);

  return moduleLocator;
}

function getSourceLocation(sourceLocator) {
  if (!sourceLocator)
    return null;

  const sourceInformation = pnp.getPackageInformation(sourceLocator);

  if (!sourceInformation)
    throw new Error(`Couldn't find the package to use as resolution source`);

  if (!sourceInformation.packageLocation)
    throw new Error(`The package to use as resolution source seem to not have been installed - maybe it's a devDependency not installed in prod?`);

  return sourceInformation.packageLocation;
}

function makeResolver(sourceLocator) {
  const sourceLocation = getSourceLocation(sourceLocator);

  return resolver => {
    const MAYBE_BUILTIN = /^[^\/]$/;

    const resolvedHook = resolver.ensureHook(`resolve`);
    resolver.getHook(`before-module`).tapAsync(`PnpResolver`, (requestContext, resolveContext, callback) => {
      let request = requestContext.request;
      let issuer = sourceLocation || requestContext.context.issuer;

      // When using require.context, issuer seems to be false (cf https://github.com/webpack/webpack-dev-server/blob/d0725c98fb752d8c0b1e8c9067e526e22b5f5134/client-src/default/index.js#L94)
      if (!issuer) {
        issuer = `${requestContext.path}/`;
      // We only support issuer when they're absolute paths. I'm not sure the opposite can ever happen, but better check here.
      } else if (!issuer.startsWith(`/`)) {
        throw new Error(`Cannot successfully resolve this dependency - issuer not supported (${issuer})`);
      }

      let resolution;

      try {
        resolution = pnp.resolveToUnqualified(request, issuer, {considerBuiltins: false});
      } catch (error) {
        return callback(error);
      }

      resolver.doResolve(
        resolvedHook,
        Object.assign({}, requestContext, {
          request: resolution,
        }),
        null,
        resolveContext,
        callback,
      );
    });
  };
}

module.exports = pnp ? {
  apply: makeResolver(null),
} : {
  apply: nothing,
};

module.exports.moduleLoader = module => pnp ? {
  apply: makeResolver(getModuleLocator(module)),
} : {
  apply: nothing,
};

module.exports.topLevelLoader = pnp ? {
  apply: makeResolver(pnp.topLevel),
} : {
  apply: nothing,
};