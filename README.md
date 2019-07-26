# Janus WebRTC backend module

## usage

1. Install FFmpeg, and configure Janus and Nginx-rtmp servers on your local machine. Start your Janus and Nginx-rtmp servers (Janus and Nginx-rtmp files are not uploaded yet).

2. Open Janus Webrtc Video Room demo page. Join the room and start publishing. Check the publisher id in the browser console.

3. Clone this repo. Manually configure the publisher id in the file `server.js` by setting the value of `var publisherId = ...`

4. Install node.js and npm on your computer

5. Install essential node modules with npm tool

        $ npm install

6. Launch `server.js`.
        
        $ node server.js 

The script will start forwarding rtp to your local address, and launch FFmpeg on your local machine to convert rtp flow to rtmp flow then send to nginx server. But it can only send one time. A listener is needed to handle the publishing requests.

## Update 26/07/2019:

Now the backend server can deal with the autorization for a publisher. It receives an publish request, creates a room, then sends back a `pin` as a secret to join the room and `id` as a unique autorized id, and listen to the room events until the arrival of the identified publisher. Once the publisher arrives, the backend will start forwarding rtp and launch FFmpeg for transcoding. 

But the code is somewhat ugly.... so needs more elegance in the future.