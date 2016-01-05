//    ======================
//   ||                    ||
//   ||     BallBot App    ||
//   ||                    ||
//    ======================
//   By Roel Noten, jirva.net
//
//   The connectivity aspects of this app are based on the 'LightBlue Bean Basic' app by Evothings AB
//
// BLE scratch bank usage:
// scratch1: App to Bean communication
//  - [0]: speed:  1-127=backward 128=none  129-255=forward
//  - [1]: steer:  1-127=left     128=none  129-255=right
//  - [2]: colorMode: 0=user, 1=balance, 2=rotation
//  - [3]: coloruser R
//  - [4]: coloruser G
//  - [5]: coloruser B
//  - [6]: sound  0=off 1=on

// scratch2: Bean to App communication
//  - [0]: temperature
//  - [1]: balance
//  - [2]: battery

document.addEventListener('deviceready', function () {
    app.initialize()
}, false);

var sound = true;
var single = true;
var currentScreen = 'notconnectedscreen';

var COLORMODE_USER = 0;
var COLORMODE_BALANCE = 1;
var COLORMODE_ROTATION = 2;
var colorMode = COLORMODE_USER;
var colorUserR = 0;
var colorUserG = 191;
var colorUserB = 255;

var nippleManagerUpDown;
var nippleManagerLeftRight;
var nippleManagerLeftRightUpDown;


var app = {};

var speed = 128;
var steer = 128;

var scratchInChecksum = 0;

app.UUID_SCRATCHSERVICE = 'a495ff20-c5b1-4b44-b512-1370f02d74de';

app.getScratchCharacteristicUUID = function (scratchNumber) {
    return ['a495ff21-c5b1-4b44-b512-1370f02d74de',
        'a495ff22-c5b1-4b44-b512-1370f02d74de',
        'a495ff23-c5b1-4b44-b512-1370f02d74de',
        'a495ff24-c5b1-4b44-b512-1370f02d74de',
        'a495ff25-c5b1-4b44-b512-1370f02d74de'][scratchNumber - 1];
};

app.initGui = function () {
    app.gotoScreen('connectedscreen');
    app.initializeColorWheel();
    app.setUserColorOnColorButton(true);
    app.initNipples();
    app.toggleSingleOrDual();
    app.gotoScreen('notconnectedscreen');//todo
    //app.gotoScreen('connectedscreen');
};

app.initialize = function () {
    app.connected = false;
};

app.deviceIsLightBlueBeanWithBleId = function (device, bleId) {
    return ((device != null) && (device.name != null) && (device.name == bleId));
};

app.connect = function (user) {
    var BLEId = document.getElementById('BLEId').value;

    app.showInfo('.Trying to connect to "' + BLEId + '"');

    app.disconnect(user);

    function onScanSuccess(device) {
        function onConnectSuccess(device) {
            function onServiceSuccess(device) {
                // Update user interface
                app.showInfo('Connected to <i>' + BLEId + '</i>');
                document.getElementById('connectbutton').innerHTML = 'Disconnect';
                document.getElementById('connectbutton').onclick = new Function('app.disconnect()');

                app.gotoScreen('connectedscreen');

                // Application is now connected
                app.connected = true;
                app.device = device;

                // Fetch current LED values.
                app.synchronizeLeds();

                // Create an interval timer to periodically read temperature/balance/battery.
                app.interval = setInterval(function () {
                    app.readScratchOut();
                }, 500);
                app.interval = setInterval(function () {
                    app.writeScratchInUpdate();
                }, 80);
            }

            function onServiceFailure(errorCode) {
                // Show an error message to the user
                app.showInfo('Error reading services: ' + errorCode);
            }

            // Connect to the appropriate BLE service
            device.readServices(
                [app.UUID_SCRATCHSERVICE],
                onServiceSuccess,
                onServiceFailure);
        }


        function onConnectFailure(errorCode) {
            // Show an error message to the user
            app.showInfo('Error ' + errorCode);
        }

        console.log('Found device: ' + device.name);

        // Connect if we have found a LightBlue Bean with the name from input (BLEId)
        var found = app.deviceIsLightBlueBeanWithBleId(device, document.getElementById('BLEId').value);
        if (found) {
            // Update user interface
            app.showInfo('Found "' + device.name + '"');

            // Stop scanning
            evothings.easyble.stopScan();

            // Connect to our device
            app.showInfo('Identifying service for communication');
            device.connect(onConnectSuccess, onConnectFailure);
        }
    }

    function onScanFailure(errorCode) {
        // Show an error message to the user
        app.showInfo('Error: ' + errorCode);
        evothings.easyble.stopScan();
    }

    // Update the user interface
    app.showInfo('Scanning...');

    // Start scanning for devices
    evothings.easyble.startScan(onScanSuccess, onScanFailure);
};

app.disconnect = function (user) {
    // If timer configured, clear.
    if (app.interval) {
        clearInterval(app.interval);
    }

    app.connected = false;
    app.device = null;

    // Stop any ongoing scan and close devices.
    evothings.easyble.stopScan();
    evothings.easyble.closeConnectedDevices();
    app.showInfo("disconnect 5");

    // Update user interface
    app.gotoScreen('notconnectedscreen');
    app.showInfo("disconnect 6");
    app.showInfo('Not connected');
    document.getElementById('connectbutton').innerHTML = 'Connect';
    document.getElementById('connectbutton').onclick = new Function('app.connect()');
};


app.readScratchOut = function () {
    function onDataReadSuccess(data) {
        var readData = new Uint8Array(data);
        var temperature = readData[0];
        console.log('Temperature read: ' + temperature + ' C');
        document.getElementById('temperature').innerHTML = '&#127777; ' + temperature + ' &#8451;';

        var battery = readData[1];
        console.log('Battery read: ' + battery + ' %');
        document.getElementById('battery').innerHTML = '&#128267; ' + battery + ' %';
        if (battery<25) {
            document.getElementById('battery').style.color = 'orange';
        } else if (battery<10) {
            document.getElementById('battery').style.color = 'red';
        } else {
            document.getElementById('battery').style.color = 'white';
        }

        document.getElementById("acceleration").innerHTML = 'X:' + readData[2] +'<br>Y:' + readData[3] +'<br>Z:' + readData[4];
    }

    function onDataReadFailure(errorCode) {
        console.log('Failed to read sratchdata with error: ' + errorCode);
        app.disconnect();
    }

    app.readDataFromScratch(2, onDataReadSuccess, onDataReadFailure);
};

app.synchronizeLeds = function () {
    //function onDataReadSuccess(data) {
    //    var ledData = new Uint8Array(data);
    //
    //    document.getElementById('redLed').value = ledData[0];
    //    document.getElementById('greenLed').value = ledData[1];
    //    document.getElementById('blueLed').value = ledData[2];
    //
    //    console.log('Led synchronized.');
    //}
    //
    //function onDataReadFailure(errorCode) {
    //    console.log('Failed to synchronize leds with error: ' + errorCode);
    //    app.disconnect();
    //}
    //
    //app.readDataFromScratch(1, onDataReadSuccess, onDataReadFailure);
};

app.writeScratchInUpdate = function () {
    if (app.connected) {
        // Print out fetched LED values
        console.log('redLed: ' + colorUserR + ', greenLed: ' + colorUserG + ', blueLed: ' + colorUserB);

        var s = 0;
        if (sound) {
            s = 1;
        }

        // Create packet to send
        data = new Uint8Array([
            speed,
            steer,
            colorMode,
            colorUserR,
            colorUserG,
            colorUserB,
            s,
            93,
            198,
            221,
            53
        ]);

        var check = 3*speed + 5*steer + 7*colorMode + 11*colorUserR + 13*colorUserG + 17*colorUserB + s;
        if (check != scratchInChecksum) {
            //app.debug("writing scratch "+check);
            scratchInChecksum = check;

            // Callbacks
            function onDataWriteSuccess() {
                app.debug('Succeeded to write data.');
            }

            function onDataWriteFailure(errorCode) {
                app.debug('Failed to write data with error: ' + errorCode);
                app.disconnect();
            }

            app.writeDataToScratch(1, data, onDataWriteSuccess, onDataWriteFailure);
        } else {
            //app.debug("writing scratch -");

        }
    }
};

app.writeDataToScratch = function (scratchNumber, data, succesCallback, failCallback) {
    if (app.connected) {
        console.log('Trying to write data to scratch ' + scratchNumber);
        app.device.writeCharacteristic(
            app.getScratchCharacteristicUUID(scratchNumber),
            data,
            succesCallback,
            failCallback);
    }
    else {
        console.log('Not connected to device, cant write data to scratch.');
    }
};

app.readDataFromScratch = function (scratchNumber, successCallback, failCallback) {
    if (app.connected) {
        console.log('Trying to read data from scratch ' + scratchNumber);
        app.device.readCharacteristic(
            app.getScratchCharacteristicUUID(scratchNumber),
            successCallback,
            failCallback);
    }
    else {
        console.log('Not connected to device, cant read data from scratch.');
    }
};

app.showInfo = function (info) {
    console.log(info);
    document.getElementById('status').innerHTML = info;
};


//------------------
//------------------
//------------------

app.back = function () {
    if (currentScreen == 'notconnectedscreen') {
        //history.back();
        location.reload();
    } else if (currentScreen == 'colorscreen') {
        app.gotoScreen('connectedscreen');
    } else if (currentScreen == 'connectedscreen') {
        app.gotoScreen('notconnectedscreen');
    }
};

app.gotoScreen = function (screen) {
    currentScreen = screen;
    document.getElementById('notconnectedscreen').style.display = 'none';
    document.getElementById('connectedscreen').style.display = 'none';
    document.getElementById('colorscreen').style.display = 'none';

    document.getElementById(''+screen).style.display = 'block';

    if (screen != 'connectedscreen') {
        //app.showInfo("gotoscreen 1 :"+nippleManagerLeftRight);
        //nippleManagerLeftRight.killNipples();
        //app.showInfo("gotoscreen 2");
        //nippleManagerUpDown.killNipples();
        //nippleManagerLeftRightUpDown.killNipples();
    }
};

app.toggleSound = function () {
    sound = !sound;
    if (sound) {
        document.getElementById('soundbutton').setAttribute('class', 'soundon');
    } else {
        document.getElementById('soundbutton').setAttribute('class', 'soundoff');
    }
};

app.toggleSingleOrDual = function () {
    single = !single;
    if (single) {
        document.getElementById('singleordualbutton').setAttribute('class', 'single');
        document.getElementById('updown').style.display = 'none';
        document.getElementById('leftright').style.display = 'none';
        document.getElementById('leftrightupdown').style.display = 'block';
    } else {
        document.getElementById('singleordualbutton').setAttribute('class', 'dual');
        document.getElementById('updown').style.display = 'block';
        document.getElementById('leftright').style.display = 'block';
        document.getElementById('leftrightupdown').style.display = 'none';
    }
};


app.toggleColor = function (toState) {
    if (toState) {
        if (toState == 'balance') {
            colorMode = COLORMODE_BALANCE;
            app.setUserColorOnColorButton(false);
            document.getElementById('colorbutton').setAttribute('class', 'balance');
        } else if (toState == 'rotation') {
            colorMode = COLORMODE_ROTATION;
            app.setUserColorOnColorButton(false);
            document.getElementById('colorbutton').setAttribute('class', 'rotation');
        } else {
            colorMode = COLORMODE_USER;
            app.setUserColorOnColorButton(true);
            document.getElementById('colorbutton').setAttribute('class', 'usercolor');
        }

    } else {
        if (currentScreen == 'colorscreen') {
            //colorMode = COLORMODE_USER;
            //app.setUserColorOnColorButton(true);
            app.gotoScreen('connectedscreen');
        } else if (currentScreen == 'connectedscreen') {
            app.gotoScreen('colorscreen');
        }
    }
};

app.setUserColorOnColorButton = function (yes) {
    if (yes) {
        var pixelColor = "rgb(" + colorUserR + ", " + colorUserG + ", " + colorUserB + ")";

        document.getElementById('colortouserbutton').style.backgroundColor = pixelColor;

        document.getElementById('colorbutton').setAttribute("class", null);
        document.getElementById('colorleft').style.color = pixelColor;
        document.getElementById('colorright').style.color = pixelColor;
        document.getElementById('colorleft').innerHTML = '&#x25C9;';
        document.getElementById('colorright').innerHTML = '&#x25C9;';
    } else {
        document.getElementById('colorbutton').setAttribute("class", null);
        document.getElementById('colorleft').innerHTML = '';
        document.getElementById('colorright').innerHTML = '';
    }
};

app.initializeColorWheel = function () {
    var canvas = document.getElementById('colorwheelcanvas');
    var ctx = canvas.getContext('2d');

    // drawing active image
    var image = new Image();
    image.onload = function () {
        ctx.drawImage(image, 0, 0, image.width, image.height); // draw the image on the canvas
    };

    image.src = 'ui/images/colorwheel.png';

    canvas.addEventListener("touchstart", app.canvasTouchHandler, false);
    canvas.addEventListener("touchmove", app.canvasTouchHandler, false);
    canvas.addEventListener("touchend", app.canvasTouchHandler, false);
};

app.canvasTouchHandler = function (event) {
    var canvas = document.getElementById('colorwheelcanvas');
    var ctx = canvas.getContext('2d');

    // get coordinates of current position
    var canvasX = Math.floor(event.touches[0].screenX - 20);//canvas.offsetLeft);
    var canvasY = Math.floor(event.touches[0].screenY - 50);//canvas.offsetTop);

    // get current pixel
    var imageData = ctx.getImageData(canvasX, canvasY, 1, 1);
    var pixel = imageData.data;

    colorUserR = pixel[0];
    colorUserG = pixel[1];
    colorUserB = pixel[2];

    // update preview color
    var pixelColor = "rgb("+pixel[0]+", "+pixel[1]+", "+pixel[2]+")";
    app.debug("pixelcolor="+colorUserR+", "+colorUserG+", "+colorUserB);

    colorMode = COLORMODE_USER;
    app.setUserColorOnColorButton(true);
};

app.initNipples = function () {
    nippleManagerUpDown = nipplejs.create({
        zone: document.getElementById('updown'),
        color: 'rgb(0,191,255)',
        size: 180,
        threshold: 0.0,
        fadeTime: 0,
        multitouch: false,
        maxNumberOfNipples: 1,
        dataOnly: false,
        mode: 'dynamic',
        restOpacity: 0.5
    });
    app.listenOnNipples(nippleManagerUpDown, true, false);

    nippleManagerLeftRight = nipplejs.create({
        zone: document.getElementById('leftright'),
        color: 'rgb(0,191,255)',
        size: 180,
        threshold: 0.0,
        fadeTime: 0,
        multitouch: false,
        maxNumberOfNipples: 1,
        dataOnly: false,
        mode: 'dynamic',
        restOpacity: 0.5
    });
    app.listenOnNipples(nippleManagerLeftRight, false, true);

    nippleManagerLeftRightUpDown = nipplejs.create({
        zone: document.getElementById('leftrightupdown'),
        color: 'rgb(0,191,255)',
        size: 180,
        threshold: 0.0,
        fadeTime: 0,
        multitouch: false,
        maxNumberOfNipples: 1,
        dataOnly: false,
        mode: 'dynamic',
        restOpacity: 0.5
    });
    app.listenOnNipples(nippleManagerLeftRightUpDown, true, true);
};

app.listenOnNipples = function (nippleManager, updown, leftright) {
    nippleManager.on('added', function (e, nipple) {
        nipple.on(' move end', function (evt, data) {
            if (data && data.angle) {
                da = data.angle;
                app.debug("move end da.degree:"+da.degree);
                if (updown) {
                    if (leftright) {
                        //updown && leftright
                        var angle = da.radian;
                        speed = app.norm(Math.sin(angle));

                        steer = app.norm(Math.cos(angle));

                    } else {
                        //updown && !leftright
                        if (da.degree>30 && da.degree<150) { //up
                            speed = app.norm(data.force);
                        } else if (da.degree>210 && da.degree<330) { //down
                            speed = 255-app.norm(data.force);
                        } else {
                            speed = app.norm(0);
                        }
                       // app.debug("speed "+speed);
                    }
                } else {
                    if (leftright) {
                        //!updown && leftright
                        if (da.degree<60 || da.degree>300) { //right
                            steer = app.norm(data.force);
                        } else if (da.degree>130 && da.degree<240) { //down
                            steer = 255-app.norm(data.force);
                        } else {
                            steer = app.norm(0);
                        }
                        //app.debug("steer "+steer);
                    } else {
                        //!updown && !leftright: doesn't happen
                    }
                }
            } else {
                if (updown) {
                    speed = app.norm(0);
                }
                if (leftright) {
                    steer = app.norm(0);
                }
            }
            app.updateNippleStats();
        });

    }).on('removed', function (e, nipple) {
  //      nipple.off('start move end dir plain');
    });
};

app.debug = function (string) {
    document.getElementById("debug").innerHTML = string;
};

app.updateNippleStats = function () {
    document.getElementById("verticalstats").innerHTML = '&#8661; ' + (speed-128).toFixed(0);
    document.getElementById("horizontalstats").innerHTML = '&#8660; ' + (steer-128).toFixed(0);
    //app.writeScratchInUpdate();
};

app.norm = function (value) {
    if (value > 1) {
        value = 1;
    }
    return 128+value*127;
};



