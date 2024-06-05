# LOCAL DEVELOPMENT
The extension is written in TypeScript intended to run on Node.js. Clone the repository and install all dependencies:
```
npm install
```


## Running WebView App Locally

The "View Diagram" command uses a WebView to render a diagram.  This is a small web application that is bundled inside the extension.

To run the Webview as a standalone application, execute the following command:

```
npm run serve
```

The above command does the following:
- Builds the app bundle, using Webpack.
- Launch a local HTTP server listening on port 8080
- Opens the app in a web browser and loads a sample diagram

### Sample Diagrams

> When running locally, an example URL might look like this:  
> http://127.0.0.1:8080/index.html?diagram=seq-5.mmd
> 
> This project uses the `media` folder as place to store static assets that will be available to the WebView App.  

There are sample `.mmd` files located in `/media/samples/` and each file in this folder can be loaded by changing the value of the `diagram` querystring parameter.