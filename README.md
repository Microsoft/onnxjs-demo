# ONNX.js Demo

ONNX.js demo is an interactive demo portal showing real use cases running [ONNX.js](https://github.com/Microsoft/onnxjs) in VueJS. It currently supports four examples for you to quickly experience the power of ONNX.js. 

The demo is available here. 

## Use Cases

The demo provides four scenarios based on four different ONNX pre-trained deep learning models. 

### 1. ResNet-50

[ResNet-50](https://github.com/onnx/models/tree/master/models/image_classification/resnet) is a highly-accurate deep convolutional network for image classification. It is trained on 1000 pre-defined classes. In the demo, you can select or upload an image and see which category it's from.

![ResNet-50 Image](https://raw.githubusercontent.com/Microsoft/onnxjs-demo/master/src/assets/resnet50.png)

### 2. Squeezenet

[SqueezeNet](https://github.com/onnx/models/tree/master/squeezenet) is a light-weight convolutional network for image classification. Similar to the ResNet-50 demo, you can select or upload an image and see which category it's from in miliseconds.

![SqueezeNet Image](https://raw.githubusercontent.com/Microsoft/onnxjs-demo/master/src/assets/squeezenet.png)

### 3. FER+ Emotion Recognition
[Emotion Ferplus](https://github.com/onnx/models/tree/master/emotion_ferplus)
 is a deep convolutional neural network for emotion recognition in faces. In the demo, you can choose to either select an image with any human face or to start a webcam and see what emotion it's showing.

![Emotion Ferplus Image](https://raw.githubusercontent.com/Microsoft/onnxjs-demo/master/src/assets/emotion.png)
                                       
### 4. MNIST

[MNIST](https://github.com/onnx/models/tree/master/mnist) is a convolutional neural network that predicts handwritten digits. In the demo, you can draw any number on the canvas and the model will tell you what number it is!

![Emotion Ferplus Image](https://raw.githubusercontent.com/Microsoft/onnxjs-demo/master/src/assets/mnist.png)

## Run ONNX.js Demo
###	Install Dependencies
```
npm install
```

###	Serve the demo
**Serve the demo in localhost**
```
npm run serve
```
This will start a dev server and run ONNX.js demo on your localhost.


### Deploy the demo  

```
npm run build
```

This will pack the source files into `/dist` folder and be ready for deployment.

**- Electron support**

After the source files are ready for deployment, you can run the following to serve the demo as a Windows desktop app using [Electron](https://electronjs.org/). 
```
npm run electron-packager
```
This will create a new `/ONNXjs-demo-win32-x64` folder. Run `/ONNXjs-demo-win32-x64/ONNXjs-demo.exe` to enjoy Electron desktop app. 

## Credits 

This demo is adapted from [keras.js demo](https://github.com/transcranial/keras-js). Modifications has been done to UIs and backends to use `ONNX.js`.

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
