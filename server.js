// server.js

var express = require('express');

var axios = require('axios');

var app = express();

var PORT = 3000;

var { spawn } = require('child_process');

var fs = require('fs')

var bodyParser = require("body-parser")

var janusHost = "http://0.0.0.0:8088/janus"
var adminHost = "http://0.0.0.0:7088/admin"
var ffmpegHost = "127.0.0.1"
var rtmpHost = "127.0.0.1"
var rtmpStreamPort = 1935

const sessionId = 1;
var handlerId = null;

var publisherId = 5035925950
var roomId = 4321
var pin = '1234'

var audioPort = 10033
var videoPort = 10038
var streamName = 'nihao'
var admin_key = 'supersecret'



app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "*");
    next();
})


app.listen(PORT, function () {
    console.log('Server is running on PORT:', PORT);
});


/**
 * Create a session to serve a publisher.
 */
async function createSession(config) {
    await axios.post(janusHost, {
        janus: "create",
        transaction: "create session",
        id: config.sessionId,
        apisecret: "janusrocks"
    }).then(res => {
        if (res.data.janus == 'success')
            config.sessionId = res.data.data.id;
        else
            console.log(res.data.error.reason)
    })
    return config
}
/**
 * Attach a videoroom handler to a session to handle the publisher's requests and events.
 */
async function attachHandler(config) {
    await axios.post(janusHost + '/' + config.sessionId, {
        janus: "attach",
        transaction: "attach videoroom plugin for session " + config.sessionId,
        plugin: "janus.plugin.videoroom",
        apisecret: "janusrocks"
    }).then(res => {
        switch (res.data.janus) {
            case "error":
                console.log("janus error: " + body.error.reason);
                break;
            case "success":
                config.handlerId = res.data.data.id;
                break;
            default: console.log("janus message is not identified")
        }
    })
    return config
}

/**
 * List the ids of all the existing rooms. If room is set "private" it will not be listed.
 */
async function listRoomId() {
    var roomIds = [];
    await axios.post(janusHost + '/' + sessionId + '/' + handlerId, {
        janus: "message",
        transaction: "list room Ids",
        apisecret: "janusrocks",
        body: {
            request: "list"
        }
    }).then(res => {
        roomList = res.data.plugindata.data.list
        for (var i in roomList) {
            roomIds.push(roomList[i].room)
        }
    })
    return roomIds;
}

/**
 * List all the participants of given rooms.
 */
function listParticipants(roomIds) {
    return new Promise((resolve, reject) => {
        var rooms_participants = []
        requests = []

        for (var i in roomIds) {
            requests.push(
                axios.post(janusHost + '/' + sessionId + '/' + handlerId, {
                    janus: "message",
                    transaction: "list room Ids",
                    apisecret: "janusrocks",
                    body: {
                        request: "listparticipants",
                        room: roomIds[i]
                    }
                }).then(res => {
                    rooms_participants.push(parseRoomParticipants(res))
                })
            )
        }
        axios.all(requests).then(() => {
            resolve(rooms_participants)
        })

    })
}

/**
 * Parse the response of "listparticipants" request and return
 * an array of participants in the room.
 * @param {*} respond JSON response of the "listparticipants" request 
 */
function parseRoomParticipants(respond) {
    data = respond.data.plugindata.data
    room_participants = { room: data.room, participants: [] }
    for (var i in data.participants) {
        room_participants.participants.push({
            id: data.participants[i].id,
            publisher: data.participants[i].publisher
        })
    }
    return room_participants
}

/**
 * Create a rtp forwarder on Janus to forward the stream of a publisher. 
 */
async function createForwarder(config /*[roomId, publisherId]*/) {
    audio_port = 10033
    audio_pt = 111
    video_port = 10038
    video_pt = 96
    await axios.post(janusHost + '/' + config.sessionId + '/' + config.handlerId, {
        janus: "message",
        transaction: "rtp forward from " + publisherId + " in room " + config.roomId,
        apisecret: "janusrocks",
        body: {
            request: "rtp_forward",
            room: config.roomId,
            "publisher_id": publisherId,
            "host": ffmpegHost,
            "audio_port": audio_port,
            "audio_pt": audio_pt,
            "video_port": video_port,
            "video_pt": video_pt,
            "secret": "secret"
        }
    })
    return config
}

/**
 * Parse the response of "listforwarders" request and return an array
 * of stream ids of a given publisher id.
 * @param {*} response JSON response of a "listforwarders" request
 * @param {*} publisherId The id of the publisher
 */
function parseForwarders(response, publisherId) {
    var forwarders = response.data.plugindata.data.rtp_forwarders
    console.log(response.data.plugindata.data)
    forwarder_raw = forwarders.filter(data => {
        return data.publisher_id == publisherId
    })
    var forwarder
    if (forwarder_raw.length > 0) {
        forwarder = forwarder_raw[0].rtp_forwarder
    }
    var streams = []
    for (var i in forwarder) {
        if (forwarder[i].hasOwnProperty("audio_stream_id")) {
            streams.push(forwarder[i].audio_stream_id)
        }
        else if (forwarder[i].hasOwnProperty("video_stream_id")) {
            streams.push(forwarder[i].video_stream_id)
        }
    }
    return streams
}

/**
 * Remove all the rtp forwarders of a publisher given his 
 * id and room id.
 */
function clearForwarders([roomId, publisherId]) {
    var listForwarders = new Promise((resolve, reject) => {
        axios.post(janusHost + '/' + sessionId + '/' + handlerId, {
            janus: "message",
            transaction: "list all rtp forwards",
            apisecret: "janusrocks",
            body: {
                request: "listforwarders",
                room: roomId,
                secret: "secret"
            }
        }).then(res => {
            var streams = parseForwarders(res, publisherId)
            resolve(streams)
        })
    })

    var removeForwarders = streams => {
        return new Promise((resolve, reject) => {
            var requests = []
            for (var i in streams) {
                requests.push(axios.post(
                    janusHost + '/' + sessionId + '/' + handlerId, {
                        janus: "message",
                        transaction: "remove rtp forward",
                        apisecret: "janusrocks",
                        body: {
                            request: "stop_rtp_forward",
                            room: roomId,
                            publisher_id: publisherId,
                            stream_id: streams[i],
                            secret: "secret"
                        }
                    })
                )
            }
            axios.all(requests).then(res => {
                // console.log(res)
            })
            resolve([roomId, publisherId])

        })
    }

    return listForwarders.then(removeForwarders);
}

/**
 * Generate an SDP file for FFmpeg to receive an rtp stream
 * from Janus.
 * @param {*} nodeStreamIp The IP address of FFmpeg 
 * @param {*} audioPort The port for receiving audio stream
 * @param {*} videoPort The port for receiving video stream
 */
function generateSdpStreamConfig(nodeStreamIp, audioPort, videoPort) {
    var sdpRtpOfferString = 'v=0\n';
    sdpRtpOfferString += 'o=- 0 0 IN IP4 ' + nodeStreamIp + '\n';
    sdpRtpOfferString += 's=RTP Video\n';
    sdpRtpOfferString += 'c=IN IP4 ' + nodeStreamIp + '\n';
    sdpRtpOfferString += 't=0 0\n';
    sdpRtpOfferString += 'm=audio ' + audioPort + ' RTP/AVP 111\n';
    sdpRtpOfferString += 'a=rtpmap:111 OPUS/48000/2\n';
    sdpRtpOfferString += 'm=video ' + videoPort + ' RTP/AVP 96\n';
    sdpRtpOfferString += 'a=rtpmap:96 H264/90000\n';
    fs.writeFileSync('v' + videoPort + '_a' + audioPort + '.sdp', sdpRtpOfferString);
}

/**
 * Generate a config of FFmpeg as command options.
 * @param {*} name The name of the rtmp stream on Nginx-rtmp server 
 */
var ffmpeg_args = (name) => {
    return [
        '-analyzeduration', '300M', '-probesize', '300M',
        '-protocol_whitelist', 'file,udp,rtp',
        '-i', 'v' + videoPort + '_a' + audioPort + '.sdp',
        '-c:v', 'copy', '-c:a', 'aac', '-ar', '16k', '-ac', '1',
        '-preset', 'ultrafast', '-tune', 'zerolatency',
        '-f', 'flv', 'rtmp://' + rtmpHost + ':' + rtmpStreamPort + '/stream/' + name
    ];
};

/**
 * Launch a FFmpeg process to transcode rtp to rtmp.
 * @param {*} nodeStreamIp The IP address of FFmpeg 
 * @param {*} audioPort The port for receiving audio stream
 * @param {*} videoPort The port for receiving video stream
 * @param {*} streamName The name of the rtmp stream on Nginx-rtmp server 
 */
async function createFFmpeg(nodeStreamIp, audioPort, videoPort, streamName) {
    generateSdpStreamConfig(nodeStreamIp, audioPort, videoPort)
    var child = spawn('ffmpeg', ffmpeg_args(streamName))

    child.stderr.on('data', function (data) {
        console.log("ffmpeg log : " + data)
    });
}

/**
 * Update the global parameters "audioPort", "videoPort" and "roomId".
 * (for test use, will be deprecated)
 */
function updateConfig() {
    audioPort--;
    videoPort++;
    roomId++;
}


async function startForwarding(config /*roomId, publisherId*/) {
    createSession().then(attachHandler)
        .then(() => { return new Promise(resolve => resolve([config.roomId, publisherId])) })
        // .then(clearForwarders)
        .then(createForwarder)
        .then(res => console.log(JSON.stringify(res)))
}

async function createRoom(config /*roomId, pin, secret, token */) {
    await axios.post(janusHost + '/' + config.sessionId + '/' + config.handlerId, {
        janus: "message",
        transaction: "create room of id " + config.roomId +
            " with pin " + config.pin + " and secret " + config.secret,
        apisecret: "janusrocks",
        body: {
            request: "create",
            room: config.roomId,
            secret: config.secret,
            pin: config.pin,
            is_private: false,
            bitrate: 128000,
            fir_freq: 1,
            videocodec: "h264",
            record: false,
            // allowed: [adminToken, config.token]
            admin_key: 'supersecret'
        },
    }).then(res => {
        console.log(res.data)
        console.log()
    })
    return config
}

async function destroyRoom(config /*roomId, secret*/) {
    axios.post(janusHost + '/' + config.sessionId + '/' + config.handlerId, {
        janus: "message",
        transaction: "destroy room of id " + config.roomId,
        apisecret: "janusrocks",
        body: {
            request: "destroy",
            room: config.roomId,
            secret: config.secret
        },
    }).then(res => {
        console.log(res.data)
        console.log()
    })
}



async function joinRoom(config /*roomId, pin*/) {
    await axios.post(janusHost + '/' + config.sessionId + '/' + config.handlerId, {
        janus: "message",
        transaction: "join the room of id " + config.roomId + " as room holder",
        apisecret: "janusrocks",
        body: {
            request: "join",
            ptype: "publisher",
            room: config.roomId,
            id: 1234,
            pin: config.pin,
        },
    })
    return config
}
/**
 *  a specific event listener to wait for the publisher to join
 */
var waitPublisher = async function (publisherId) {
    var maxev = 5;
    var longpoll = janusHost + '/' + sessionId + '?rid=' + new Date().getTime();
    longpoll = longpoll + '&maxev=' + 5;
    var joined = false;
    // Parse the event message and check if the publisher has joined the room
    var parseJoined = json => {
        try {
            if (json.plugindata.data.publishers.filter(data => {
                console.log(data.id == publisherId)
                return data.id == publisherId
            }).length > 0) {
                console.log("parsed ! ")
                console.log(json.plugindata.data.publishers)
                return true
            }
            else
                return false
        } catch (e) {
            console.log("non parsed :(")
            return false
        }
    }
    var cn = 1
    while (!joined) {
        await axios.get(longpoll).then(res => {
            console.log('count = ' + cn++)
            console.log(JSON.stringify(res.data))
            for (var i in res.data) {
                if (parseJoined(res.data[i])) {
                    joined = true;
                    break;
                }
            }
        })
    }
}

async function listenEvent(config) {
    var longpoll = janusHost + '/' + config.sessionId + '?rid=' + new Date().getTime();
    longpoll = longpoll + '&maxev=' + 5;
    while (config.sessionId !== undefined && config.sessionId !== null) {
        await axios.get(longpoll).then(res => {
            for (var i in res.data) {
                console.log(res.data[i])
            }
            handleEvent(res.data, config);
        })
    }
    return config
}

async function handleEvent(json, config) {
    for (var i in json) {
        switch (json[i].janus) {
            case 'event':
                handleVideoroomEvent(json[i].plugindata.data, config)
            case 'keepalive':
                break;
            default:
                console.log("handleEvent: unknown event")
        }
    }
}

async function handleVideoroomEvent(json, config) {
    switch (json.videoroom) {
        case 'event':
            // some videoroom room events
            if (json.hasOwnProperty('leaving')) {
                if (json.leaving == publisherId) {
                    destroyRoom(config)
                    config.leaving = true;
                    // then destroy the room
                    // TODO 

                }
            }
            break
        case 'joined':
            // admin joined the room
            break;
        case 'destroyed':
            // room has been destroyed, stop listening.
            config.roomId = null;
            break;
        default:
            console.log("Something weird in videoroom plugin event")
            break;
    }
}

var responseConfig = (requestConfig) => {
    var resConfig;
    if (requestConfig.login == "yanhao" && requestConfig.passwd == '1234') {

        resConfig = {
            status: "success",
            key: {
                room: requestConfig.roomid,
                pin: pin,
                id: publisherId
            }
        };
    }

    else
        resConfig = {
            status: "error",
            reason: "Authentification failed"
        }
    return resConfig
}


/** *-* Processing of a client request:
 * 1. Create new session/handler to manage client Alice (done)
 * 2. Create a room for Alice with a pin (for Alice to join) and a secret (done)
 * 3. Create a token for Alice and add the token to the whitelist of the room. (TODO)
 * 4. Join the room. (done)
 * 5. Set eventHandler() to listen any event from the room => event: 
 *          'keep alive':  
 *          'joined': 
 *          'leave': TODO
 *          'destroyed': TODO
 *          'error': TODO 
 * 6. create id for Alice and send pin and id to Alice (done)
 * 7. wait for the joined event of Alice (done)
 * 8. start rtp forwarder and ffmpeg transcoder (done)
 * 9. Wait for some unknown requests ... then handle them !
 * 9. wait for Alice to leave 
 * 10. destroy the room (done)
 * 
 */
app.post('/stream', async function (req, res) {
    console.log(req.body)
    var resConfig = responseConfig(req.body)
    var roomId = resConfig.key.room
    var adminConfig = {
        sessionId: 1, handlerId: null,
        roomId: roomId, pin: pin, secret: 'secret', token: null
    };
    if (resConfig.status == 'success') {
        await createSession(adminConfig).then(attachHandler)
            .then(createRoom)
            .then(joinRoom)
        res.status(201).send(resConfig);
        await waitPublisher(publisherId)
        await createForwarder(adminConfig)
        // await startForwarding(adminConfig)
        //     createFFmpeg(ffmpegHost, audioPort, videoPort, streamName)]);
        // await startForwarding(roomId, publisherId)
        await createFFmpeg(ffmpegHost, audioPort, videoPort, streamName)
        updateConfig(); // update audioPort, videoPort and roomId config
        listenEvent(adminConfig);

    }
    else {
        res.status(500).send(resConfig);
    }
    // var allowed = await waitPublisher(publisherId)
});