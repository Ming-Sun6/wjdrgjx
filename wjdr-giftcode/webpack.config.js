const Dotenv = require('dotenv-webpack');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  // 入口文件：Webpack 从这里开始构建依赖图
  entry: './static/js/app966.js',
  // 输出配置
  output: {
    // 打包后的文件名
    filename: 'app966.wjdr.js',
    path: path.resolve(__dirname, 'static', 'js'),
    clean: false,  // 不清理输出目录
  },
  plugins: [
      new Dotenv({
        path: './.env',
      }),
    ],
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true, // 移除console
          },
        },
      }),
    ],
  },
};