// server.js

var express = require('express');

var axios = require('axios');

var app = express();

var PORT = 3000;

var { spawn } = require('child_process');

var fs = require('fs')

var bodyParser = require("body-parser")

var janusHost = "http://localhost:8088/janus"
var adminHost = "http://localhost:7088/admin"
var ffmpegHost = "127.0.0.1"
var rtmpHost = "127.0.0.1"
var rtmpStreamPort = 1935

const sessionId = 1;
var handlerId = null;

var publisherId = 5035925950
var roomId = 1234
var audioPort = 10033
var videoPort = 10038
var streamName = 'nihao'
var admin_key = 'supersecret'
var clientId = 5678



app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "*");
    next();
})


// Some examples for tutorial

app.get('/get', function (req, res) {
    res.status(200).send(req.url);
    // res.status(200).send('alive');
});

const configurejanus = args => {
    // console.log(args)  // json
    return
}



app.listen(PORT, function () {
    console.log('Server is running on PORT:', PORT);
});

// Start the functional parts of the backend script



function createSession() {
    return new Promise((resolve, reject) => {
        axios.post(janusHost, {
            janus: "create",
            transaction: "create session",
            id: sessionId,
            apisecret: "janusrocks"
        }).then(res => resolve())
    })
}

var createHandler = async function () {

    // var handlerId;
    await axios.post(janusHost + '/' + sessionId, {
        janus: "attach",
        transaction: "create videoroom administrator",
        plugin: "janus.plugin.videoroom",
        apisecret: "janusrocks"
    }).then(res => {
        var body = res.data
        switch (body.janus) {
            case "error":
                // console.log("janus error: " + JSON.stringify(body.error));
                break;
            case "success":
                handlerId = body.data.id;
                break;
            default: console.log("janus message is not identified")
        }

    })
}


function listRoomId() {
    return new Promise((resolve, reject) => {
        var roomIds = [];
        axios.post(janusHost + '/' + sessionId + '/' + handlerId, {
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
            // console.log(roomIds)
            resolve(roomIds)
        })
    })
}

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

function createFowarder([roomId, publisherId]) {
    return new Promise((resolve, reject) => {
        audio_port = 10033
        audio_pt = 111
        video_port = 10038
        video_pt = 96
        // roomId = 1234
        // publisherId = 6764174377861019
        axios.post(janusHost + '/' + sessionId + '/' + handlerId, {
            janus: "message",
            transaction: "rtp forward from " + publisherId + " in room " + roomId,
            apisecret: "janusrocks",
            body: {
                request: "rtp_forward",
                room: roomId,
                "publisher_id": publisherId,
                "host": ffmpegHost,
                "audio_port": audio_port,
                "audio_pt": audio_pt,
                "video_port": video_port,
                "video_pt": video_pt,
                "secret": "adminpwd"
            }
        }).then(res => {
            resolve(res.data.plugindata.data)
        })
    })
}

function parseForwarders(respond, publisherId) {
    var forwarders = respond.data.plugindata.data.rtp_forwarders
    console.log(respond.data.plugindata.data)
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
                            secret: "adminpwd"
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
    fs.writeFileSync('mysdp.sdp', sdpRtpOfferString);
}

var ffmpeg_args = (name) => {
    return [
        '-analyzeduration', '300M', '-probesize', '300M',
        '-protocol_whitelist', 'file,udp,rtp',
        '-i', 'mysdp.sdp',
        '-c:v', 'copy', '-c:a', 'aac', '-ar', '16k', '-ac', '1',
        '-preset', 'ultrafast', '-tune', 'zerolatency',
        '-f', 'flv', 'rtmp://' + rtmpHost + ':' + rtmpStreamPort + '/stream/' + name
    ];
};

function createFFmpeg(nodeStreamIp, audioPort, videoPort, streamName) {
    generateSdpStreamConfig(nodeStreamIp, audioPort, videoPort)
    var child = spawn('ffmpeg', ffmpeg_args(streamName))

    child.stderr.on('data', function (data) {
        console.log("ffmpeg error : " + data)
    });
}


// View all room info 
// createSession().then(createHandler).then(listRoomId).then(listParticipants).then(res => console.log(JSON.stringify(res)))

// Forward rtp given the publisher id and room id.


function startForwarding(roomId, publisherId) {
    createSession().then(createHandler)
        .then(() => { return new Promise(resolve => resolve([roomId, publisherId])) })
        .then(clearForwarders)
        .then(createFowarder)
        .then(res => console.log(JSON.stringify(res)))
}


// startForwarding(roomId, publisherId)
// createFFmpeg(ffmpegHost, audioPort, videoPort, streamName)

/** *-* Processing of a client request:
 * 1. create new session/handler to manage client Alice (done)
 * 
 * 2. set session_timeout to max (failed, can't set timeout value to a specific session)
 * 3. create a room for Alice with a pin (for Alice to join) and a secret (for me to manipulate the room)
 * 4. Join the room. 
 * 5. Set eventHandler() to listen any event from the room => event: 
 *          'keep alive': 
 *          'joined': 
 *          'leave':
 *          'destroyed':
 *          'error':  
 * 6. create id for Alice and send pin and id to Alice 
 * 7. wait for the joined event of Alice 
 * 8. start rtp forwarder and ffmpeg transcoder (done)
 * 9. Wait for some unknown requests ... then handle them !
 * 9. wait for Alice to leave 
 * 10. destroy the room (done)
 * 
 */



var roomId = 1234
var pin = '1234'

var createRoom = (roomId, pin, secret /*, token */) => async function () {
    await axios.post(janusHost + '/' + sessionId + '/' + handlerId, {
        janus: "message",
        transaction: "create room of id " + roomId + " with pin " + pin + " and secret " + secret,
        apisecret: "janusrocks",
        body: {
            request: "create",
            room: roomId,
            secret: secret,
            // pin: pin,
            is_private: true,
            // allowed: [token1, token2, ...]
            admin_key: 'supersecret'
        },
    }).then(res => {
        console.log(res.data)
        console.log()
    })
}

var destroyRoom = (roomId, secret) => async function () {
    axios.post(janusHost + '/' + sessionId + '/' + handlerId, {
        janus: "message",
        transaction: "destroy room of id " + roomId,
        apisecret: "janusrocks",
        body: {
            request: "destroy",
            room: roomId,
            secret: secret
        },
    }).then(res => {
        console.log(res.data)
        console.log()
    })
}

var setTimeout = (timeout) => async function () {
    axios.post(adminHost, {
        janus: "set_session_timeout",
        timeout: timeout,
        transaction: "set timeout value to " + timeout + 's',
        admin_secret: 'janusoverlord'
    }).then(res => {
        console.log(res.data)
    })
}

var joinRoom = (roomId, pin) => async function () {
    await axios.post(janusHost + '/' + sessionId + '/' + handlerId, {
        janus: "message",
        transaction: "join the room of id " + roomId + " as room holder",
        apisecret: "janusrocks",
        body: {
            request: "join",
            ptype: 'publisher',
            room: roomId,
            id: 1234,
            pin: pin,

        },
    })
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
            console.log(json.plugindata.data.publishers)
            if (json.plugindata.data.publishers.filter(data => {
                return data.id == publisherId
            })){
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
            console.log(res.data)
            for (var i in res.data) {
                if (parseJoined(res.data[i])) {
                    joined = true;
                    break;
                }
            }
        })
    }
}

async function listenEvent() {
    var longpoll = janusHost + '/' + sessionId + '?rid=' + new Date().getTime();
    longpoll = longpoll + '&maxev=' + 5;
    var events;
    while (sessionId !== undefined && sessionId !== null) {
        await axios.get(longpoll).then(res => {
            for (var i in res.data) {
                console.log(res.data[i])
            }
            events = res.data;
        })
        handleEvent(events);
    }
}

async function handleEvent(json) {
    for (var i in json) {
        switch (json[i].janus) {
            case 'event':
                handleVideoroomEvent(json[i].plugindata.data)
            case 'keepalive':
                break;
            default:
                console.log("handleEvent: unknown event")
        }
    }
}

async function handleVideoroomEvent(json) {
    switch (json.videoroom) {
        case 'event':
            if (json.publishers != null) {
                console.log(json.publishers)
                for (var i in json.publishers) {
                    if (json.publishers[i].id == publisherId) {
                        // startForwarding(roomId, publisherId)
                        // createFFmpeg(ffmpegHost, audioPort, videoPort, streamName)
                    }
                }
            }
            break;
        case 'joined':
            break;
        case 'destroyed':
            break;
        default:
            console.log("Something weird in videoroom plugin event")
            break;
    }
}

var responseConfig = (requestConfig) => {
    var resConfig;
    if (requestConfig.login == "yanhao" && requestConfig.passwd == '1234')
        resConfig = {
            status: "success",
            key: {
                pin: 1234,
                id: publisherId
            }
        };
    else
        resConfig = {
            status: "error",
            reason: "Authentification failed"
        }
    return resConfig
}

app.post('/stream', async function (req, res) {
    console.log(req.body)
    var resConfig = responseConfig(req.body)
    await createSession().then(createHandler)
        .then(createRoom(roomId, pin, 'secret'))
        .then(joinRoom(roomId, pin))
    if (resConfig.status == 'success') {
        res.status(201).send(resConfig);
    }
    else {
        res.status(500).send(resConfig);
    }
    var allowed = await waitPublisher(publisherId)
    startForwarding(roomId, publisherId)
    createFFmpeg(ffmpegHost, audioPort, videoPort, streamName)
    listenEvent();
});


// createSession().then(createHandler)
//     .then(destroyRoom(roomId, 'secret'))
//     .then(createRoom(roomId, pin, 'secret')).then(joinRoom(roomId, pin))
//     .then(waitPublisher)
//     .then(()=>{
//         startForwarding(roomId, publisherId);
//         createFFmpeg(ffmpegHost, audioPort, videoPort, streamName)
//     })

// then(destroyRoom(roomId, 'secret')).
// createSession().then(createHandler).then(destroyRoom(roomId, 'secret'))