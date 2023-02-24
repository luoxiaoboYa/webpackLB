const path = require("path");
const fs = require("fs");
const { SyncHook } = require("tapable");
const parser = require("@babel/parser") // 解析器,将代码解析为AST
let types = require("@babel/types") //用来生成或者判断节点的AST语法树的节点
const traverse = require("@babel/traverse").default; // 遍历/修改 AST的工具
const generator = require("@babel/generator").default; // 生成器.将AST还原成代码

// 生成运行时代码
function getSource(chunk) {
    return `
    (() => {
        var modules = {
            ${chunk.modules.map((module) => `"${module.id}": (module) => {
                ${module._source}
                }`
            )}
        };
        var cache = {};
        function require(moduleId) {
            var cacheModule = cache[moduleId];
            if(cacheModule !== undefined) {
                return cacheModule.exports;
            }
            var module = (cache[moduleId] = {
                export: {},
            });
            modules[moduleId](module,module.exports,require) 
            return module.exports;
        }
        var exports = {};
        ${chunk.entryModule._source}

    })()
    `
}

//Compiler其实是一个类，它是整个编译过程的大管家，而且是单例模式
class Compiler {
    constructor(webpackOptions){
        this.options = webpackOptions // 存储配置信息
        // 它内部提供了很多钩子
        this.hooks = {
            run: new SyncHook(), // 会在编译刚开始的时候触发此run钩子
            done: new SyncHook(), // 会在编译结束的时候触发此done钩子
        }
    }
    compile(callback) {
        // 虽然webpack只有一个Compiler,但是每次编译都会产出一个新的Compilation
        // 这里主要是为了考虑到watch模式,它会在启动时先编译一遍,然后监听文件变化,如果发生变化会重新开始编译
        // 每次编译都会产出一个新的Compilation ,代表每次的编译结果
        let compilation = new Compilation(this.options) 
        compilation.build(callback) // 执行compilation的build方法进行编译,编译成功之后执行回调
    }
    // 第四步: 执行 Compiler 对象的 run方法开始执行编译
    run(callback) {
        this.hooks.run.call() // 在编译前触发run钩子执行,表示开始启动编译了
        const onCompiled = (err, stats, fileDependencies) => {
            // 第十步: 确定好输出内容之后,根据配置的输出路径和文件名,将文件内容写入到文件系统(这里是硬盘)
            for(let filename in stats.assets) {
                let filePath = path.join(this.options.output.path, filename)
                fs.writeFileSync(filePath, stats.assets[filename], "utf8")
            }
            callback(err,{
                toJson: () => stats,
            })
            // 实现watch模式,监听fileDependencies里面的文件,当文件发生变化时,重新执行compile
            fileDependencies.forEach((fileDependencie) => {
                fs.watch(fileDependencie,() => this.compile(onCompiled))
            })

            this.hooks.done.call() // 在编译成功后会触发done这个钩子执行
        }
        this.compile(onCompiled) // 开始编译,成功之后调用 onCompiled
    } 
}

// 第一步: 搭建结构,读取配置参数,这里接受的是webpack.config.js中的参数
function webpack(webpackOptions) {
    // 第二步: 用配置参数对象初始化 'Compiler' 对象
    const compiler = new Compiler(webpackOptions)
    // 第三步: 挂载配置文件中的插件
    const { plugins } = webpackOptions;
    for (let plugin of plugins) {
        plugin.apply(compiler)
    }
     //第四步：执行 `Compiler` 对象的 `run` 方法开始执行编译
    return compiler 
}
// 因为要获取入口文件的绝对路径,考虑到操作系统的兼容性问题, 将 \ 替换成 / 
function toUnixPath(filePath) {
    return filePath.replace(/\\/g,"/")
}
const baseDir = toUnixPath(process.cwd()) // 获取工作目录,在哪里执行命令就获取哪里的目录,这里获取的也是跟操作系统有关系,要替换成 / 


// 获取文件路径
function tryExtensions (modulePath,extensions) {
    if(fs.existsSync(modulePath)) {
        return modulePath
    }
    for(let i = 0; i < extensions?.length; i++) {
        let filePath = modulePath + extensions[i]
        if(fs.existsSync(filePath)) {
            return filePath
        }
    }
    throw new Error(`无法找到${modulePath}`)
}
// 编译阶段最为复杂,且考虑到watch mode场景(当文件变化时,将重新进行编译) 因此将编译阶段单独解耦出来方便使用和理解
class Compilation {
    constructor(webpackOptions) {
        this.options = webpackOptions
        this.modules = [] // 本次编译所有生成出来的模块
        this.chunks = [] // 本次编译产出的所有代码块,入口模块和依赖的模块打包在一起为代码块
        this.assets = {} // 本次编译产出的资源文件
        this.fileDependencies = [] // 本次打包涉及到的文件,这里主要是为了实现watch模式下的监听文件变化,文件发生变化后会重新编译
    }
    // 当编译模块的时候,name:这个模块是属于哪个代码块chunk的,modulePath:模块绝对路径
    buildModule(name,modulePath) {
        // 6.2.1 读取模块内容,获取源代码
        let sourceCode = fs.readFileSync(modulePath,"utf8")
        // buildModule 最终会返回一个modules模块对象,每个模块多会有一个id,id是相对于根目录的相对路径
        let moduleId = "./" + path.posix.relative(baseDir,modulePath) // 模块id:从根目录触发,找到与该模块的相对路径（./src/index.js）
        // 6.2.2 创建模块对象
        let module = {
            id: moduleId,
            names: [name], // name设计成数组是因为代表的是此模块属于哪个代码块,可能属于多个代码块
            dependencies: [], // 它依赖的模块
            _source: "", // 该模块的代码信息(该模块转译后的源代码)
        }
        // 6.2.3 找到对应的 loader 对源码进行翻译和替换
        let loaders = []
        let { rules = [] } = this.options.module
        rules.forEach(rule => {
            let { test } = rule
            if(modulePath.match(test)) {
                loaders.push(...rule.use)
            }
            
        });
        // 自右向左对模块进行转译
        sourceCode = loaders.reduceRight((code,loader) => {
            return loader(code)
        }, sourceCode)
        // 通过loader 翻译后的内容一定得是js内容,因为最后得走我们babel-parse,只有js才能编译成AST
        // 第七步: 找出此模块所依赖的模块,在对依赖模块进行编译
        let ast = parser.parse(sourceCode, { sourceType: "module"}) 
        traverse(ast, {
            CallExpression: nodePath => {
                const { node } = nodePath
                // 7.2: 在 AST 中查找 require 语句,找到依赖的模块名称和绝对路径
                if(node.callee.name === "require") {
                    let depModuleName = node.arguments[0].value // 获取依赖的模块
                    let dirname = path.posix.dirname(modulePath)  // 获取当前正在编译的模块所在的目录
                    let depModulePath = path.posix.join(dirname,depModuleName) // 获取依赖模块的绝对路径
                    let extensions = this.options.resolve?.extensions || [ ".js" ] // 获取配置汇总的extensions
                    depModulePath = tryExtensions(depModulePath,extensions) // 尝试添加后缀,找到一个真实在硬盘上存在的文件
                    // 7.3: 将依赖模块的绝对路径 push 到 this.fileDependencies 中
                    this.fileDependencies.push(depModulePath)
                    // 7.4: 生成依赖模块的 模块id
                    let depModuleId = "./" + path.posix.relative(baseDir,depModulePath)
                    // 7.5:修改语法结构,把依赖的模块改为依赖 模块id,, require("./name")=>require("./src/name.js")  所谓模块是 ./name 模块id则是 ./src/name.js
                    node.arguments = [types.stringLiteral(depModuleId)]
                    // 7.6: 将依赖模块的信息,push到该模块的 dependencies 属性中
                    module.dependencies.push({ depModuleId, depModulePath })
                }
            }
        })

        // 7.7: 生成新代码,并把转译后的源代码放到 module._source 属性上
        let { code } = generator(ast)
        module._source = code
        // 7.8: 对依赖模块进行编译,(对 module 对象中的 dependencies 进行递归执行 buildModule)
        module.dependencies.forEach(({ depModuleId, depModulePath }) =>{
            // 考虑到多入口打包: 一个模块被多个其他模块引用,不需要重复打包
            let existModule = this.modules.find((item) => item.id === depModuleId)
            // 如果modules 里已经存在这个简要编译的依赖模块了,那么就不需要编译了,直接把此代码块的名称添加到对应模块的 names字段里就可以了
            if(existModule) {
                // names指的是它属于哪个代码块chunk
                existModule.names.push(name)
            }else{
                // 如果不存在,则再次执行 buildModule进行编译
                let depModule = this.buildModule(name,depModulePath)
                // 7.9: 对依赖模块编译完成后,得到依赖模块的module对象,push到 this.modules 中
                this.modules.push(depModule)
            }
        })
        //7.10：等依赖模块全部编译完成后，返回入口模块的 `module` 对象
        return module
    }
    build(callback) {
        // 第五步: 根据配置文件中的 entry 配置项找到所有的入口
        let entry = {}
        console.log(this.options)
        if (typeof this.options.entry === "string") {
            entry.main = this.options.entry // 如果是单入口,将entry: "xx"变成{main:"xx"},这里需要做兼容
        } else {
            entry = this.options.entry
        }
        // 第六步: 从入口文件出发,调用配置的 loader 规则,对各模块进行编译
        for(let entryName in entry) {
            let entryFilePath = path.posix.join(baseDir,entry[entryName]) // path.posix为了解决不同操作系统的路径分隔符,这里拿到的就是入口文件的绝对路径
            // 6.1 把入口文件的绝对路径添加到依赖数组 (`this.fileDependencies`)中,记录此次编译依赖的模块
            this.fileDependencies.push(entryFilePath)
            // 6.2 得到入口模块的 module对象(里面放着该模块的路径、依赖模块、源代码等)
            let  entryModule = this.buildModule(entryName,entryFilePath)
            // 6.3 将生成的入口文件 module 对象 push 进 this.modules 中
            this.modules.push(entryModule)
            // 第八步: 等所有模块都编译完成后,根据模块之间的依赖关系,组装代码块 chunk (一般来说,每个入口文件会对应一个代码块 chunk ,每个代码块 chunk 里面会放着本入口模块和它依赖的模块)
            let chunk = {
                name: entryName, // entryName = "main" 代码块的名称
                entryModule, // 此代码块对应的module的对象,这里就是src/index.js的module对象
                modules:this.modules.filter((item) => item.names.includes(entryName)), // 找出属于该代码块的模块
            }
            this.chunks.push(chunk)
        }
        // 第九步: 把各个代码块 chunk  转换成一个一个文件加入到输出列表
        this.chunks.forEach((chunk) => {
            let filename = this.options.output.filename.replace("[name]", chunk.name) 
            this.assets[filename] = getSource(chunk)
        })
        // 这里开始做编译工作,编译成功执行 callback
        callback(null, {
            chunks: this.chunks,
            modules: this.modules,
            assets: this.assets,
        },
        this.fileDependencies
        )
    }
}



// 自定义插件 WebpackRunPlugin
class  WebpackRunPlugin {
    apply(compiler) {
        compiler.hooks.run.tap("WebpackRunPlugin",() => {
            console.log("开始编译")
        })
    }
}
// 自定义插件 WebpackDonePlugin
class  WebpackDonePlugin {
    apply(compiler) {
        compiler.hooks.done.tap("WebpackDonePlugin",() => {
            console.log("结束编译")
        })
    }
}
const loader1 = (source) => {
    return source + "//给你的代码加点注释:loader1"
}
const loader2 = (source) => {
    return source + "//给你的代码加点注释:loader2"
}

module.exports = {
    webpack,
    WebpackRunPlugin,
    WebpackDonePlugin,
    loader1,
    loader2,
  };