const { webpack } = require("./webpack.js") // 手写webpack 
console.log('🚀 ~ file: debugger.js:2 ~ webpack:', webpack)
const webpackOptions = require("./webpack.config.js")
console.log('🚀 ~ file: debugger.js:3 ~ webpackOptions:', webpackOptions)
const compiler = webpack(webpackOptions)

// 开始编译
compiler.run((err,stats)=>{
    console.log(err)
    console.log(stats.toJson({
        assets: true, // 打印本次编译产出的资源
        chunks: true, // 打印本次编译产出的代码块
        modules: true, // 打印本次编译产出的模块
    }))
})