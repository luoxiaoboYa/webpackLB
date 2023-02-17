
// 整体是一个立即执行函数
/******/ (() => { // webpackBootstrap 
// 初始化: 定义了一个对象 __webpack_modules__, key为模块的路径,value是一个函数,函数里面是我们边写的源代码
/******/ 	var __webpack_modules__ = ({

/***/ "./src/age.js":
/*!********************!*\
  !*** ./src/age.js ***!
  \********************/
/***/ ((module) => {

module.exports = "100"


/***/ }),

/***/ "./src/name.js":
/*!*********************!*\
  !*** ./src/name.js ***!
  \*********************/
/***/ ((module) => {

module.exports = "萝卜是个前端牙"

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache 定义缓存对象
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function 定义加载模块函数require
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
// 以下是入口文件 src/index.js
(() => {
/*!**********************!*\
  !*** ./src/index.js ***!
  \**********************/
const name = __webpack_require__(/*! ./name.js */ "./src/name.js")
const age = __webpack_require__(/*! ./age.js */ "./src/age.js")

console.log("entry文件打印作者信息",name,age)
})();

/******/ })()
;
//# sourceMappingURL=main.js.map