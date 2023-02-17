//Compiler其实是一个类，它是整个编译过程的大管家，而且是单例模式
class Compiler {
    constructor(webpackOptions){
        this.options = webpackOptions
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
        const onCompiled = () => {
            this.hooks.done.call() // 在编译成功后会触发done这个钩子执行
        }
        this.compile(onCompiled) // 开始编译,成功之后调用 onCompiled
    } 
}

// 第一步: 搭建结构,读取配置参数,这里接受的是webpack.config.js中的参数
function webpack(webpackOptions) {
    // 第二步: 用配置参数对象初始化 'Compiler' 对象
    const compiler = new Compiler()
    // 第三步: 挂载配置文件中的插件
    const { plugins } = webpackOptions;
    for (let plugin of plugins) {
        plugin.apply(compiler)
    }
    return compiler 
}
// 因为要获取入口文件的绝对路径,考虑到操作系统的兼容性问题, 将 \ 替换成 / 
function toUnixPath(filePath) {
    return filePath.replace(/\\/g,"/")
}
const baseDir = toUnixPath(process.cwd()) // 获取工作目录,在哪里执行命令就获取哪里的目录,这里获取的也是跟操作系统有关系,要替换成 / 

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
            _source: "", // 该模块的代码信息
        }
        // 6.2.3 找到对应的 loader 对源码进行翻译和替换
        let loaders = []
        let { rules = [] } = this.options.module
        rules.forEach(rule => {
            let { tes } = rule
            if(modulePath.match(test)) {
                loaders.push(...rule.use)
            }
            
        });
        // 自右向左对模块进行转译
        sourceCode = loaders.reduceRight((code,loader) => {
            return loader(code)
        }, sourceCode)
        
        return module
    }
    build(callback) {
        // 第五步: 根据配置文件中的 entry 配置项找到所有的入口
        let entry = {}
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
        }
        // 这里开始做编译工作,编译成功执行 callback
        callback()
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