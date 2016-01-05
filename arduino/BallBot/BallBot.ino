#include <NewTone.h>

#include <Adafruit_NeoPixel.h>


// BLE scratch bank usage:
//
// scratch1: App to Bean communication
//  - [0]: speed:  1-127=backward 128=none  129-255=forward
//  - [1]: steer:  1-127=left     128=none  129-255=right
//  - [2]: colorMode: 0=user, 1=balance, 2=rotation
//  - [3]: coloruser R
//  - [4]: coloruser G
//  - [5]: coloruser B
//  - [6]: sound  0=off 1=on
//
// scratch2: Bean to App communication
//  - [0]: temperature
//  - [1]: balance
//  - [2]: battery 

#define COLORMODE_USER          0
#define COLORMODE_BALANCE       1 
#define COLORMODE_ROTATION      2

#define PIN_MOTOR_VCC           5 //DRV8838 VCC    Motor left&right  
#define PIN_MOTOR_PHASE_LEFT    4 //DRV8838 Phase  Motor left
#define PIN_MOTOR_ENABLE_LEFT   3 //DRV8838 Enable Motor left
#define PIN_PIEZO               2 //Piezo
#define PIN_NEOPIXEL            1 //Neopixel LEDs WS2812 based
#define PIN_MOTOR_ENABLE_RIGHT  0 //DRV8838 Enable Motor right
#define PIN_BATTERY_LEVEL      A1 //Battery level (R divider from battery directly)
#define PIN_MOTOR_PHASE_RIGHT  A0 //DRV8838 Phase  Motor right

bool isConnected;
AccelerationReading accel = {0, 0, 0};
int left;
int right;

//              C6    CS6   E6    A6    AS6   E7    A7    AS7
int tones[] = { 1047, 1109, 1319, 1760, 1865, 2637, 3520, 3729, 0, 0 };
#define BEEP_LENGTH  30
unsigned long nextBeep = 0;
uint8_t beeps[10];
uint8_t currentBeep = 10;

 
Adafruit_NeoPixel neopixels = Adafruit_NeoPixel(2, PIN_NEOPIXEL, NEO_RGB + NEO_KHZ800);

void setup() {          
    Bean.enableWakeOnConnect(true);
    Bean.setAccelerationRange(2); //2, 4, 8 or 16
    
    pinMode(PIN_MOTOR_VCC, OUTPUT);         
    pinMode(PIN_MOTOR_PHASE_LEFT, OUTPUT);         
    pinMode(PIN_MOTOR_ENABLE_LEFT, OUTPUT);        
    pinMode(PIN_PIEZO, OUTPUT);          
    pinMode(PIN_NEOPIXEL, OUTPUT);         
    pinMode(PIN_MOTOR_ENABLE_RIGHT, OUTPUT);         
    pinMode(PIN_BATTERY_LEVEL, INPUT);          
    pinMode(PIN_MOTOR_PHASE_RIGHT, OUTPUT);    

    neopixels.begin();
    neopixels.setBrightness(16);
    neopixels.show(); //all off

    off();
    updateLeds(0, 255, 0, 0, 255, 0);
    Bean.setLed(0, 255, 0);   
    NewTone(PIN_PIEZO, tones[0], BEEP_LENGTH);
    delay(50);
    updateLeds(0, 0, 0, 0, 0, 0);
    Bean.setLed(0, 0, 0);   

    clearInScratch();
}

void loop() {
    bool wasConnected = isConnected;
    isConnected = getConnectionState();
    if (!isConnected) {
      if (wasConnected) {
        //ondisconnect
        off();
      }
      Bean.sleep(1000000000);
    } else {
      if (!wasConnected) {
        //onconnect
        clearInScratch();
        NewTone(PIN_PIEZO, tones[0], BEEP_LENGTH);
        updateLeds(255, 0, 0, 255, 0, 0);
        delay(40);
        updateLeds(0, 0, 0, 0, 0, 0);
        delay(20);
        updateLeds(0, 255, 0, 0, 255, 0);
        NewTone(PIN_PIEZO, tones[5], BEEP_LENGTH);
        delay(40);
        updateLeds(0, 0, 0, 0, 0, 0);
        delay(20);
        updateLeds(0, 0, 255, 0, 0, 255);
        delay(40);
        updateLeds(0, 0, 0, 0, 0, 0);

        randomSeed(millis());
        initBeep();
      }
      doLoop();
    }
}

bool getConnectionState() {
    //Bean.getConnectionState() sometimes returns false while still in fact connected. Proposed workaround is to retry a few times.
    for (int i=0; i<5; i++) {
        if (Bean.getConnectionState()) {
            return true;
        }
        delay(5);
    }
    return false;
}

void doLoop() {
    Bean.setLed(0, 0, 30);   

   // Bean.setLed(0, 250, 0);
   // delay(20);
   // Bean.setLed(0, 0, 0);
    delay(5);

    // ----------- read inputs
    ScratchData scratchIn = Bean.readScratchData(1);
    uint8_t speedd =    scratchIn.data[0];
    uint8_t steer =     scratchIn.data[1];
    uint8_t colorMode = scratchIn.data[2];
    uint8_t colorR =    scratchIn.data[3];
    uint8_t colorG =    scratchIn.data[4];
    uint8_t colorB =    scratchIn.data[5];
    uint8_t sound =     scratchIn.data[6];

    uint8_t magic1 =    scratchIn.data[7];
    uint8_t magic2 =    scratchIn.data[8];
    uint8_t magic3 =    scratchIn.data[9];
    uint8_t magic4 =    scratchIn.data[10];

    if (magic1 == 93 && magic2 == 198 && magic3 == 221 && magic4 == 53) {
        
        accel = Bean.getAcceleration();

        updateMotors(speedd, steer);    

        if (colorMode == COLORMODE_USER) {
            updateLeds(colorR, colorG, colorB, colorR, colorG, colorB);
        } else if (colorMode == COLORMODE_BALANCE) {
            updateLedsBalance();
        } else if (colorMode == COLORMODE_ROTATION) {
            updateLedsRotation();
        }
    
        updateOutputs();

        if (sound == 1) {
          tickBeep();
        } else {
          initBeep();
        }
    } else {
      //connect with other kind of bluetooth device
      off();
      delay(20);
    }
}

void off() {
    Bean.setLed(0, 0, 0);   
    updateLeds(0, 0, 0, 0, 0, 0);
    updateMotors(0, 0);  
}

void updateMotors(uint8_t speedd, uint8_t steer) {
  int prevleftAndRight = abs(left) + abs(right);
  
  if (speedd == 0 && steer == 0) {
    digitalWrite(PIN_MOTOR_VCC, LOW);
    analogWrite(PIN_MOTOR_ENABLE_LEFT, 0);
    analogWrite(PIN_MOTOR_ENABLE_RIGHT, 0);
    return;
  } 
  digitalWrite(PIN_MOTOR_VCC, HIGH);

  int sp = speedd - 128;
  int st = steer - 128;
  
  st = st*1.5; //steer sensitive factor
  
  left = sp*2;
  right = sp*2;

  left = left + st;
  right = right - st;

  if (left > 255) {
    int d = left - 255;
    left = 255;
    right = right - d;
  } else if (left < -255) {
    int d = left + 256;
    left = -255;
    right = right + d;
  }

  if (right > 255) {
    int d = right - 255;
    right = 255;
    left = left - d;
  } else if (right < -255) {
    int d = right + 256;
    right = -255;
    left = left + d;
  }

  if (left > 0) {
      digitalWrite(PIN_MOTOR_PHASE_LEFT, LOW);
  } else {
      digitalWrite(PIN_MOTOR_PHASE_LEFT, HIGH);
  }
  if (right > 0) {
      digitalWrite(PIN_MOTOR_PHASE_RIGHT, HIGH);
  } else {
      digitalWrite(PIN_MOTOR_PHASE_RIGHT, LOW);
  }

  analogWrite(PIN_MOTOR_ENABLE_LEFT, abs(left));
  analogWrite(PIN_MOTOR_ENABLE_RIGHT, abs(right));

  if ((abs(left) + abs(right)) - prevleftAndRight > 50) {
      //big accelleration
      initBeep();
  }
}

void updateLeds(uint8_t colorRleft, uint8_t colorGleft, uint8_t colorBleft, uint8_t colorRright, uint8_t colorGright, uint8_t colorBright) {
    neopixels.setPixelColor(0, colorRleft, colorGleft, colorBleft);
    neopixels.setPixelColor(1, colorRright, colorGright, colorBright);
    neopixels.show(); // This sends the updated pixel color to the hardware.
}

void updateLedsBalance() {
  uint8_t b = 128+(accel.xAxis/2);
  uint8_t r = 0;//128+(accel.yAxis/1);
  uint8_t g = 98+(accel.zAxis/3);
  //~128 is straight up
  int offset = abs(128-g) * 6;
  if (offset < 255) {
    g = 255 - offset;
    r = offset;
  } else {
    r = 255;
    g = 0;
  }

  b = abs(b-128);
  
  /*
  g = 255 - offset
  if (b < 128) {
    g = (128-b)*2;
    b = 0;
  } else {
    b = (b-128)*2;
    g = 0;
  }
  */
  updateLeds(r, g, b, r, g, b);
}

void updateLedsRotation() {
  uint8_t rLeft = 0;
  uint8_t gLeft = 0;
  uint8_t rRight = 0;
  uint8_t gRight = 0;
  if (left > 0) {
      gLeft = left;
  } else {
      rLeft = -left;
  }
  if (right > 0) {
      gRight = right;
  } else {
      rRight = -right;
  }
  updateLeds(rLeft, gLeft, 0, rRight, gRight, 0);
}

void updateOutputs() {
    uint8_t out[5];
    out[0] = Bean.getTemperature();
    out[1] = getBattery();//Bean.getBatteryVoltage();
    out[2] = 128+(accel.xAxis/2);
    out[3] = 128+(accel.yAxis/1);
    out[4] = 98+(accel.zAxis/3);
    Bean.setScratchData(2, out, 5);

    if (out[4] < 30 || out[4] > 180) {
      // z unnaturally offesetted: must be tricked by a human: make noise
      initBeep();
    }
}

void clearInScratch() {
    //clear input sratchdata
    uint8_t in[11];
    in[0] = 0; //speed
    in[1] = 0; //steer
    in[2] = 0; //colormode
    in[3] = 0; //r
    in[4] = 0; //g
    in[5] = 0; //b
    in[6] = 0; //sound
    in[7] = 0; //magic
    in[8] = 0; //magic
    in[9] = 0; //magic
    in[10] = 0; //magic
    Bean.setScratchData(1, in, 11);   
}

int getBattery() {
    int b = analogRead(PIN_BATTERY_LEVEL); //0 to 1023
    //met b/4 -- >>  begonnen met 221 tot 170    150 is dood
    //neem tussen 210 en 160

    b = b/2-320;
    b = constrain(b, 0, 100);
    return b; 
}

void initBeep() {
    nextBeep = 0;
    currentBeep = 10;
}

void tickBeep() {
    unsigned long m = millis();
    if (m > nextBeep) {
        if (currentBeep == 10) {
            //init
            currentBeep = 0;
            int length = random(1, 11);
            for (int i=0; i<10; i++) {
                if (i<length) {
                    beeps[i] = random(0, 11);    
                } else {
                    beeps[i] = 0;
                }
            }
        }

        //play
        if (beeps[currentBeep] != 0) {
            int freq = tones[beeps[currentBeep]];
            NewTone(PIN_PIEZO, freq, BEEP_LENGTH);
        }
        currentBeep++;
        if (currentBeep >= 10) {
          //end
          currentBeep = 10;
          nextBeep = m + BEEP_LENGTH + random(1000, 15000);
        } else {
          nextBeep = m + BEEP_LENGTH + BEEP_LENGTH;
        }
    }
}
    
