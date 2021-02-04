'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var os = require('os');
var child_process = require('child_process');
var fs = require('fs');
var path = require('path');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var os__default = /*#__PURE__*/_interopDefaultLegacy(os);
var fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);
var path__default = /*#__PURE__*/_interopDefaultLegacy(path);

var indentString = (string, count = 1, options) => {
	options = {
		indent: ' ',
		includeEmptyLines: false,
		...options
	};

	if (typeof string !== 'string') {
		throw new TypeError(
			`Expected \`input\` to be a \`string\`, got \`${typeof string}\``
		);
	}

	if (typeof count !== 'number') {
		throw new TypeError(
			`Expected \`count\` to be a \`number\`, got \`${typeof count}\``
		);
	}

	if (typeof options.indent !== 'string') {
		throw new TypeError(
			`Expected \`options.indent\` to be a \`string\`, got \`${typeof options.indent}\``
		);
	}

	if (count === 0) {
		return string;
	}

	const regex = options.includeEmptyLines ? /^/gm : /^(?!\s*$)/gm;

	return string.replace(regex, options.indent.repeat(count));
};

const extractPathRegex = /\s+at.*(?:\(|\s)(.*)\)?/;
const pathRegex = /^(?:(?:(?:node|(?:internal\/[\w/]*|.*node_modules\/(?:babel-polyfill|pirates)\/.*)?\w+)\.js:\d+:\d+)|native)/;
const homeDir = typeof os__default['default'].homedir === 'undefined' ? '' : os__default['default'].homedir();

var cleanStack = (stack, options) => {
	options = Object.assign({pretty: false}, options);

	return stack.replace(/\\/g, '/')
		.split('\n')
		.filter(line => {
			const pathMatches = line.match(extractPathRegex);
			if (pathMatches === null || !pathMatches[1]) {
				return true;
			}

			const match = pathMatches[1];

			// Electron
			if (
				match.includes('.app/Contents/Resources/electron.asar') ||
				match.includes('.app/Contents/Resources/default_app.asar')
			) {
				return false;
			}

			return !pathRegex.test(match);
		})
		.filter(line => line.trim() !== '')
		.map(line => {
			if (options.pretty) {
				return line.replace(extractPathRegex, (m, p1) => m.replace(p1, p1.replace(homeDir, '~')));
			}

			return line;
		})
		.join('\n');
};

const cleanInternalStack = stack => stack.replace(/\s+at .*aggregate-error\/index.js:\d+:\d+\)?/g, '');

class AggregateError extends Error {
	constructor(errors) {
		if (!Array.isArray(errors)) {
			throw new TypeError(`Expected input to be an Array, got ${typeof errors}`);
		}

		errors = [...errors].map(error => {
			if (error instanceof Error) {
				return error;
			}

			if (error !== null && typeof error === 'object') {
				// Handle plain error objects with message property and/or possibly other metadata
				return Object.assign(new Error(error.message), error);
			}

			return new Error(error);
		});

		let message = errors
			.map(error => {
				// The `stack` property is not standardized, so we can't assume it exists
				return typeof error.stack === 'string' ? cleanInternalStack(cleanStack(error.stack)) : String(error);
			})
			.join('\n');
		message = '\n' + indentString(message, 4);
		super(message);

		this.name = 'AggregateError';

		Object.defineProperty(this, '_errors', {value: errors});
	}

	* [Symbol.iterator]() {
		for (const error of this._errors) {
			yield error;
		}
	}
}

var aggregateError = AggregateError;

var pMap = async (
	iterable,
	mapper,
	{
		concurrency = Infinity,
		stopOnError = true
	} = {}
) => {
	return new Promise((resolve, reject) => {
		if (typeof mapper !== 'function') {
			throw new TypeError('Mapper function is required');
		}

		if (!((Number.isSafeInteger(concurrency) || concurrency === Infinity) && concurrency >= 1)) {
			throw new TypeError(`Expected \`concurrency\` to be an integer from 1 and up or \`Infinity\`, got \`${concurrency}\` (${typeof concurrency})`);
		}

		const result = [];
		const errors = [];
		const iterator = iterable[Symbol.iterator]();
		let isRejected = false;
		let isIterableDone = false;
		let resolvingCount = 0;
		let currentIndex = 0;

		const next = () => {
			if (isRejected) {
				return;
			}

			const nextItem = iterator.next();
			const index = currentIndex;
			currentIndex++;

			if (nextItem.done) {
				isIterableDone = true;

				if (resolvingCount === 0) {
					if (!stopOnError && errors.length !== 0) {
						reject(new aggregateError(errors));
					} else {
						resolve(result);
					}
				}

				return;
			}

			resolvingCount++;

			(async () => {
				try {
					const element = await nextItem.value;
					result[index] = await mapper(element, index);
					resolvingCount--;
					next();
				} catch (error) {
					if (stopOnError) {
						isRejected = true;
						reject(error);
					} else {
						errors.push(error);
						resolvingCount--;
						next();
					}
				}
			})();
		};

		for (let i = 0; i < concurrency; i++) {
			next();

			if (isIterableDone) {
				break;
			}
		}
	});
};

const pMap$1 = (iterable, mapper, options) => new Promise((resolve, reject) => {
	options = Object.assign({
		concurrency: Infinity
	}, options);

	if (typeof mapper !== 'function') {
		throw new TypeError('Mapper function is required');
	}

	const {concurrency} = options;

	if (!(typeof concurrency === 'number' && concurrency >= 1)) {
		throw new TypeError(`Expected \`concurrency\` to be a number from 1 and up, got \`${concurrency}\` (${typeof concurrency})`);
	}

	const ret = [];
	const iterator = iterable[Symbol.iterator]();
	let isRejected = false;
	let isIterableDone = false;
	let resolvingCount = 0;
	let currentIndex = 0;

	const next = () => {
		if (isRejected) {
			return;
		}

		const nextItem = iterator.next();
		const i = currentIndex;
		currentIndex++;

		if (nextItem.done) {
			isIterableDone = true;

			if (resolvingCount === 0) {
				resolve(ret);
			}

			return;
		}

		resolvingCount++;

		Promise.resolve(nextItem.value)
			.then(element => mapper(element, i))
			.then(
				value => {
					ret[i] = value;
					resolvingCount--;
					next();
				},
				error => {
					isRejected = true;
					reject(error);
				}
			);
	};

	for (let i = 0; i < concurrency; i++) {
		next();

		if (isIterableDone) {
			break;
		}
	}
});

var pMap_1 = pMap$1;
// TODO: Remove this for the next major release
var _default = pMap$1;
pMap_1.default = _default;

const pFilter = async (iterable, filterer, options) => {
	const values = await pMap_1(
		iterable,
		(element, index) => Promise.all([filterer(element, index), element]),
		options
	);
	return values.filter(value => Boolean(value[0])).map(value => value[1]);
};

var pFilter_1 = pFilter;
// TODO: Remove this for the next major release
var _default$1 = pFilter;
pFilter_1.default = _default$1;

const IS_ATOM = typeof atom !== 'undefined';
const IS_DEV = typeof atom !== 'undefined' && (atom.inDevMode() || atom.inSpecMode());
const IGNORED_CONFIG_NAME = 'atom-package-deps.ignored';

/*!
 * escape-html
 * Copyright(c) 2012-2013 TJ Holowaychuk
 * Copyright(c) 2015 Andreas Lubbe
 * Copyright(c) 2015 Tiancheng "Timothy" Gu
 * MIT Licensed
 */

/**
 * Module variables.
 * @private
 */

var matchHtmlRegExp = /["'&<>]/;

/**
 * Module exports.
 * @public
 */

var escapeHtml_1 = escapeHtml;

/**
 * Escape special characters in the given string of html.
 *
 * @param  {string} string The string to escape for inserting into HTML
 * @return {string}
 * @public
 */

function escapeHtml(string) {
  var str = '' + string;
  var match = matchHtmlRegExp.exec(str);

  if (!match) {
    return str;
  }

  var escape;
  var html = '';
  var index = 0;
  var lastIndex = 0;

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escape = '&quot;';
        break;
      case 38: // &
        escape = '&amp;';
        break;
      case 39: // '
        escape = '&#39;';
        break;
      case 60: // <
        escape = '&lt;';
        break;
      case 62: // >
        escape = '&gt;';
        break;
      default:
        continue;
    }

    if (lastIndex !== index) {
      html += str.substring(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== index
    ? html + str.substring(lastIndex, index)
    : html;
}

async function spawnInternal(command, args, options) {
    const spawnedProcess = child_process.spawn(command, args, options);
    const promise = new Promise((resolve, reject) => {
        const output = {
            stdout: spawnedProcess.stdout ? [] : null,
            stderr: spawnedProcess.stderr ? [] : null,
        };
        spawnedProcess.on('error', reject);
        if (spawnedProcess.stdout) {
            spawnedProcess.stdout.on('data', function (chunk) {
                output.stdout.push(chunk);
                if (options.handleStdout) {
                    options.handleStdout(chunk);
                }
            });
        }
        if (spawnedProcess.stderr) {
            spawnedProcess.stderr.on('data', function (chunk) {
                output.stderr.push(chunk);
                if (options.handleStderr) {
                    options.handleStderr(chunk);
                }
            });
        }
        spawnedProcess.on('close', code => {
            let outputStdout = null;
            if (output.stdout != null) {
                outputStdout =
                    options.encoding === null || options.encoding === 'buffer'
                        ? Buffer.concat(output.stdout)
                        : output.stdout.join('');
            }
            let outputStderr = null;
            if (output.stderr != null) {
                outputStderr =
                    options.encoding === null || options.encoding === 'buffer'
                        ? Buffer.concat(output.stderr)
                        : output.stderr.join('');
            }
            resolve({
                exitCode: code,
                stdout: outputStdout,
                stderr: outputStderr,
            });
        });
    });
    options.handleChildProcess(spawnedProcess);
    return promise;
}
function spawn(command, args, options) {
    let spawnedProcess;
    const promise = spawnInternal(command, args, {
        ...options,
        handleChildProcess(_spawnedProcess) {
            spawnedProcess = _spawnedProcess;
        },
    });
    promise.kill = function (signal) {
        // TODO: kill all subprocesses on windows with wmic?
        return spawnedProcess.kill(signal);
    };
    return promise;
}

var semverCompare = function cmp (a, b) {
    var pa = a.split('.');
    var pb = b.split('.');
    for (var i = 0; i < 3; i++) {
        var na = Number(pa[i]);
        var nb = Number(pb[i]);
        if (na > nb) return 1;
        if (nb > na) return -1;
        if (!isNaN(na) && isNaN(nb)) return 1;
        if (isNaN(na) && !isNaN(nb)) return -1;
    }
    return 0;
};

async function getDependencies(packageName) {
  const packageModule = atom.packages.getLoadedPackage(packageName);
  const packageDependencies = packageModule && packageModule.metadata['package-deps'];
  return Array.isArray(packageDependencies) ? packageDependencies : [];
}
async function resolveDependencyPath(packageName) {
  return atom.packages.resolvePackagePath(packageName);
}
async function getInstalledDependencyVersion(dependency) {
  var _packageModule$metada;

  const packageModule = atom.packages.getLoadedPackage(dependency.name);
  return packageModule == null ? null : (_packageModule$metada = packageModule.metadata.version) !== null && _packageModule$metada !== void 0 ? _packageModule$metada : null;
}

async function getDependencies$1(packageName) {
  let packageStats = null;

  try {
    packageStats = await fs__default['default'].promises.stat(packageName);
  } catch (_) {// No Op
  }

  if (packageStats == null || !packageStats.isDirectory()) {
    throw new Error(`[Package-Deps] Expected packageName to be a readable directory in Node.js invocation`);
  }

  let parsed = null;

  try {
    const contents = await fs__default['default'].promises.readFile(path__default['default'].join(packageName, 'package.json'), 'utf8');
    parsed = JSON.parse(contents);
  } catch (_) {// Ignore JSON read errors and such
  }

  const packageDependencies = parsed == null || typeof parsed !== 'object' ? [] : parsed['package-deps'];
  return Array.isArray(packageDependencies) ? packageDependencies : [];
}
async function resolveDependencyPath$1(packageName) {
  var _process$env$ATOM_HOM;

  const packageDirectory = path__default['default'].join((_process$env$ATOM_HOM = process.env.ATOM_HOME) !== null && _process$env$ATOM_HOM !== void 0 ? _process$env$ATOM_HOM : path__default['default'].join(os__default['default'].homedir(), '.atom'), 'packages', packageName);

  try {
    await fs__default['default'].promises.access(packageDirectory, fs__default['default'].constants.R_OK);
    return packageDirectory;
  } catch (_) {
    return null;
  }
}
async function getInstalledDependencyVersion$1(dependency) {
  var _manifest$version, _manifest;

  const {
    directory
  } = dependency;

  if (directory == null) {
    // Not possible to get version without resolved directory in Node.js version
    return null;
  }

  let manifest = null;

  try {
    manifest = JSON.parse(await fs__default['default'].promises.readFile(path__default['default'].join(directory, 'package.json'), 'utf8'));
  } catch (_) {
    return null;
  }

  return (_manifest$version = (_manifest = manifest) === null || _manifest === void 0 ? void 0 : _manifest.version) !== null && _manifest$version !== void 0 ? _manifest$version : null;
}

/**
 * Internal helpers
 */

async function getInstalledDependencyVersion$2(dependency) {
  if (IS_ATOM) {
    const atomPackageVersion = await getInstalledDependencyVersion(dependency);

    if (atomPackageVersion) {
      return atomPackageVersion;
    } // If the package isn't activated, it won't be loaded, so fallback to reading manifest file instead

  }

  return getInstalledDependencyVersion$1(dependency);
}
/**
 * Exported helpers
 */


const resolveDependencyPath$2 = IS_ATOM ? resolveDependencyPath : resolveDependencyPath$1;
function invariant(condition, message) {
  if (!condition) {
    throw new Error(message !== null && message !== void 0 ? message : 'Invariant violation');
  }
}
async function getDependencies$2(name) {
  const dependencies = await (IS_ATOM ? getDependencies(name) : getDependencies$1(name));

  if (IS_DEV) {
    invariant(Array.isArray(dependencies), `Dependencies for ${name} are not a valid array`);
    dependencies.forEach((item, index) => {
      if (Array.isArray(item)) {
        item.forEach((subitem, subindex) => {
          const invalidMessage = `Dependency#${index}#${subindex} for ${name} is invalid`;
          invariant(typeof subitem.name === 'string' && subitem.name.length > 0, invalidMessage);
          invariant(subitem.minimumVersion == null || typeof subitem.minimumVersion === 'string' && subitem.minimumVersion.length > 0, invalidMessage);
        });
        invariant(item.length > 0, `Dependency#${index} for ${name} has no group items`);
      } else {
        const invalidMessage = `Dependency#${index} for ${name} is invalid`;
        invariant(typeof item.name === 'string' && item.name.length > 0, invalidMessage);
        invariant(item.minimumVersion == null || typeof item.minimumVersion === 'string' && item.minimumVersion.length > 0, invalidMessage);
      }
    });
  }

  return dependencies;
}
async function shouldInstallDependency(dependency) {
  if (dependency.directory == null) {
    // Not installed, so install
    return true;
  }

  if (dependency.minimumVersion == null) {
    // Already installed and no version defined, so skip
    return false;
  }

  const version = await getInstalledDependencyVersion$2(dependency);

  if (version == null) {
    // Unable to get current version, so install
    return true;
  }

  return semverCompare(dependency.minimumVersion, version) === 1;
}
function isPackageIgnored(name) {
  var _atom$config$get;

  if (!IS_ATOM) {
    // Never ignored in CLI
    return false;
  }

  const ignoredPackages = (_atom$config$get = atom.config.get(IGNORED_CONFIG_NAME)) !== null && _atom$config$get !== void 0 ? _atom$config$get : [];

  if (ignoredPackages.includes(name)) {
    return true;
  }

  return false;
}
function markPackageAsIgnored(name) {
  var _atom$config$get2;

  if (!IS_ATOM) {
    // No op in CLI
    return;
  }

  const ignoredPackages = new Set((_atom$config$get2 = atom.config.get(IGNORED_CONFIG_NAME)) !== null && _atom$config$get2 !== void 0 ? _atom$config$get2 : []);
  ignoredPackages.add(name);
  atom.config.set(IGNORED_CONFIG_NAME, Array.from(ignoredPackages));
}
const INSTALL_VALID_TICKS = new Set(['✓', 'done']);
const INSTALL_VALIDATION_REGEXP = /(?:Installing|Moving) (.*?) to .* (.*)/; // Example success output: Uninstalling linter-ui-default ✓

async function installPackage(dependency) {
  const apmPath = IS_ATOM ? atom.packages.getApmPath() : 'apm';
  const {
    stdout,
    stderr
  } = await spawn(apmPath, ['install', dependency.name, '--production', '--color', 'false']);
  const match = INSTALL_VALIDATION_REGEXP.exec(stdout.trim());

  if (match != null && INSTALL_VALID_TICKS.has(match[2])) {
    // Installation complete and verified
    return;
  }

  const error = new Error(`Error installing dependency: ${dependency.name}`);
  error.stack = stderr.trim();
  throw error;
}

let showResetInstruction = true;
function confirmPackagesToInstall({
  packageName,
  dependencies
}) {
  return new Promise(resolve => {
    const ungroupedDependencies = dependencies.filter(item => !Array.isArray(item));
    const groupedDependencies = dependencies.filter(item => Array.isArray(item));
    const skipGroups = groupedDependencies.length === 0;
    const detail = skipGroups ? ungroupedDependencies.map(item => item.name).join(', ') : 'Something went wrong. Check your developer console';
    const groupChoices = groupedDependencies.map(item => item[0]); // If Atom "notifications" package is disabled output a warning in case no other notifications package is installed.

    if (atom.packages.isPackageDisabled('notifications')) {
      console.warn(`Enable notifications to install dependencies for ${packageName}`);
    }

    const notification = atom.notifications.addInfo(`${packageName} needs to install dependencies`, {
      dismissable: true,
      icon: 'cloud-download',
      detail,
      description: `Install dependenc${dependencies.length === 1 ? 'y' : 'ies'}?`,
      buttons: [{
        text: 'Yes',
        onDidClick: () => {
          if (skipGroups) {
            resolve([]);
          } else {
            resolve(ungroupedDependencies.concat(groupChoices));
          }

          notification.dismiss();
        }
      }, {
        text: 'No Thanks',
        onDidClick: () => {
          notification.dismiss();
        }
      }, {
        text: 'Never',
        onDidClick: () => {
          markPackageAsIgnored(packageName);

          if (showResetInstruction) {
            showResetInstruction = false;
            atom.notifications.addInfo('How to reset package-deps memory', {
              dismissable: true,
              description: "To modify the list of ignored files invoke 'Application: Open Your Config' and change the 'atom-package-deps' section"
            });
          }

          notification.dismiss();
        }
      }]
    });
    notification.onDidDismiss(() => resolve([]));

    if (skipGroups) {
      return;
    } // Handle groups


    try {
      var _notificationView$ele;

      const notificationView = atom.views.getView(notification);
      const notificationElement = (_notificationView$ele = notificationView === null || notificationView === void 0 ? void 0 : notificationView.element) !== null && _notificationView$ele !== void 0 ? _notificationView$ele : null;

      if (notificationElement == null) {
        throw new Error('Unable to get notification element from view');
      }

      const notificationContent = notificationElement.querySelector('.detail-content');

      if (notificationContent == null) {
        throw new Error('Content detail container not found inside the notification');
      } // Clear the contents and add some skel


      notificationContent.innerHTML = ''; // Add list of ungroup dependencies to the top of the notification

      if (ungroupedDependencies.length > 0) {
        const ungroupedLine = document.createElement('div');
        ungroupedLine.innerHTML = `Packages without choices: <br /><ul><li>${ungroupedDependencies.map(item => escapeHtml_1(item.name)).join('</li><li>')}</li></ul>`;
        notificationContent.appendChild(ungroupedLine);
      } // Create a label line for groups


      const groupLabelLine = document.createElement('div');
      groupLabelLine.innerHTML = `Packages with choices:`;
      notificationContent.appendChild(groupLabelLine); // Create one line per group with a select inside

      const groupedList = document.createElement('ul');
      groupedDependencies.forEach((item, index) => {
        const listItem = document.createElement('li');
        const select = document.createElement('select');
        select.innerHTML = item.map(subitem => `<option>${escapeHtml_1(subitem.name)}</option>`).join('\n');
        select.addEventListener('change', () => {
          // Change the selected value for this index for resolve to use
          const subitem = item.find(entry => entry.name === select.value);

          if (subitem != null) {
            groupChoices[index] = subitem;
          }
        });
        listItem.style.marginTop = '5px';
        listItem.appendChild(select);
        groupedList.appendChild(listItem);
      });
      notificationContent.appendChild(groupedList);
    } catch (err) {
      console.error('[Package-Deps] Error during showing package choices to user', err);
    }
  });
}
function getView({
  packageName,
  dependencies
}) {
  const failed = [];
  const notification = atom.notifications.addInfo(`Installing ${packageName} dependencies`, {
    detail: `Installing ${dependencies.map(item => item.name).join(', ')}`,
    dismissable: true
  });
  const progress = document.createElement('progress');
  progress.max = dependencies.length;
  progress.style.width = '100%';

  try {
    var _notificationView$ele2;

    const notificationView = atom.views.getView(notification);
    const notificationElement = (_notificationView$ele2 = notificationView === null || notificationView === void 0 ? void 0 : notificationView.element) !== null && _notificationView$ele2 !== void 0 ? _notificationView$ele2 : null;

    if (notificationElement == null) {
      throw new Error('Unable to get notification element from view');
    }

    const notificationContent = notificationElement.querySelector('.detail-content');

    if (notificationContent == null) {
      throw new Error('Content detail container not found inside the notification');
    }

    notificationContent.appendChild(progress);
  } catch (err) {
    console.error('[Package-Deps] Error during showing installation progress to user', err);
  }

  return {
    handleFailure({
      dependency,
      error
    }) {
      var _error$stack;

      failed.push(dependency.name);
      progress.value += 1;
      console.error(`[Package-Deps] Unable to install ${dependency.name}, Error:`, (_error$stack = error === null || error === void 0 ? void 0 : error.stack) !== null && _error$stack !== void 0 ? _error$stack : error);
    },

    handleDependencyInstalled(dependency) {
      progress.value += 1;
    },

    handleComplete() {
      notification.dismiss();

      if (failed.length > 0) {
        atom.notifications.addWarning(`Failed to install ${packageName} dependencies`, {
          detail: `These packages were not installed, check your console\nfor more info.\n${failed.join('\n')}`,
          dismissable: true
        });
      } else {
        atom.notifications.addSuccess(`Installed ${packageName} dependencies`, {
          detail: `Installed ${dependencies.map(item => item.name).join(', ')}`
        });
      }

      Promise.all(dependencies.map(item => {
        if (!failed.includes(item.name)) {
          return atom.packages.activatePackage(item.name);
        }

        return null;
      })).catch(err => {
        console.error(`[Package-Deps] Error activating installed packages for ${packageName}`, err);
      });
    }

  };
}

async function confirmPackagesToInstall$1({
  dependencies
}) {
  // No user interaction on the CLI. Install the first (aka "default" choice) package
  return dependencies.map(item => Array.isArray(item) ? item[0] : item);
}
function getView$1({
  dependencies
}) {
  let failed = false;
  console.log(`Installing dependencies:\n${dependencies.map(item => `  - ${item.name}`).join('\n')}`);
  return {
    handleFailure({
      dependency,
      error
    }) {
      var _error$stack;

      failed = true;
      console.error(`Unable to install ${dependency.name}, Error:`, (_error$stack = error === null || error === void 0 ? void 0 : error.stack) !== null && _error$stack !== void 0 ? _error$stack : error);
    },

    handleDependencyInstalled(dependency) {
      console.log('Successfully installed', dependency.name);
    },

    handleComplete() {
      console.log('Installation complete');

      if (failed) {
        // Fail the invocation
        process.exitCode = 1;
      }
    }

  };
}

const getView$2 = IS_ATOM ? getView : getView$1;
const confirmPackagesToInstall$2 = IS_ATOM ? confirmPackagesToInstall : confirmPackagesToInstall$1;

async function install(packageName, hideUserPrompt = false) {
  invariant(typeof packageName === 'string' && packageName.length > 0, '[Package-Deps] Package name is required');

  if (isPackageIgnored(packageName)) {
    // User ignored this package
    return;
  } // Get list of relevant dependencies


  const dependencies = await getDependencies$2(packageName);

  if (dependencies.length === 0) {
    // Short-circuit
    return;
  } // Resolve directories of relevant dependencies


  const resolvedDependencies = await Promise.all(dependencies.map(async item => {
    if (Array.isArray(item)) {
      return Promise.all(item.map(async subitem => ({ ...subitem,
        directory: await resolveDependencyPath$2(subitem.name)
      })));
    }

    return { ...item,
      directory: await resolveDependencyPath$2(item.name)
    };
  })); // Filter out already installed, in range dependencies
  // If one dependency from a group is already installed, whole group is ignored

  const dependenciesToInstall = await pFilter_1(resolvedDependencies, async function (item) {
    if (Array.isArray(item)) {
      return (await Promise.all(item.map(subitem => shouldInstallDependency(subitem)))).every(Boolean);
    }

    return shouldInstallDependency(item);
  });

  if (dependenciesToInstall.length === 0) {
    // Short-circuit if all have been skipped
    return;
  }

  let chosenDependencies;

  if (!hideUserPrompt) {
    chosenDependencies = await confirmPackagesToInstall$2({
      packageName,
      dependencies: dependenciesToInstall
    });
  } else {
    // prompt-less installation
    chosenDependencies = dependenciesToInstall.map(dep => {
      if (Array.isArray(dep)) {
        return dep[0];
      }

      return dep;
    });
  }

  if (chosenDependencies.length === 0) {
    // Short-circuit if user interaction cancelled all
    return;
  }

  const view = getView$2({
    packageName,
    dependencies: chosenDependencies
  });
  await pMap(chosenDependencies, async function (dependency) {
    try {
      await installPackage(dependency);
      view.handleDependencyInstalled(dependency);
    } catch (err) {
      view.handleFailure({
        dependency,
        error: err
      });
    }
  }, {
    concurrency: 2
  });
  view.handleComplete();
}

exports.install = install;
