# Janus WebRTC backend module

## usage

1. Install FFmpeg, and configure Janus and Nginx-rtmp servers on your local machine. (Janus and Nginx-rtmp files are not uploaded yet) 

2. Open Janus Webrtc Video Room demo page. Join the room and start publishing. Check the publisher id in the browser console.

3. Clone this repo. Manually configure the publisher id in the file `server.js` by setting the value of `var publisherId = ...`

4. Install node.js and npm on your computer

5. Install essential node modules with npm tool

        $ npm install

6. Launch `server.js`.
        
        $ node server.js 

The script will start forwarding rtp to your local address, and launch FFmpeg on your local machine to convert rtp flow to rtmp flow then send to nginx server. But it can only send one time. A listener is needed to handle the publishing requests.
