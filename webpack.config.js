const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './src/webview/index.ts',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/webview/index.html', to: 'index.html' },
        { from: 'media/svg-pan-zoom.min.js', to: 'media/svg-pan-zoom.min.js' },
        { from: 'media/tailwind.min.css', to: 'media/tailwind.min.css' },
        { from: 'media/styles.css', to: 'media/styles.css' },
        { from: 'media/samples/**/*.mmd', to: '' },
      ],
    }),
  ],
};
