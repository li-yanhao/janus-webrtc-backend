// server.js

var express = require('express');

var request = require('request');

var axios = require('axios');

var app = express();

var PORT = 3000;

var { spawn } = require('child_process');

var fs = require('fs')




// Some examples for tutorial

app.get('/get', function (req, res) {
    res.status(200).send(req.url);
    // res.status(200).send('alive');
});

const configurejanus = args => {
    console.log(args)  // json
    return args.yanhao
}

app.post('/stream', function (req, res) {
    const config = configurejanus(req.body)
    if (!config) {
        res.status(500);
    } else {
        res.status(201).send(config);
    }
});

app.listen(PORT, function () {
    console.log('Server is running on PORT:', PORT);
});

// Start the functional parts of the backend script

var janusHost = "http://localhost:8088/janus"
var ffmpegHost = "127.0.0.1"
var rtmpHost = "127.0.0.1"
var rtmpStreamPort = 1935

const sessionId = 1;
var adminId = null;

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

function createHandler() {
    return new Promise((resolve, reject) => {
        var handlerId;
        axios.post(janusHost + '/' + sessionId, {
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
                    adminId = body.data.id;
                    break;
                default: console.log("janus message is not identified")
            }
            resolve()
        })
    })
}


function listRoomId() {
    return new Promise((resolve, reject) => {
        var roomIds = [];
        axios.post(janusHost + '/' + sessionId + '/' + adminId, {
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
                axios.post(janusHost + '/' + sessionId + '/' + adminId, {
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
        axios.post(janusHost + '/' + sessionId + '/' + adminId, {
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
    forwarder_raw = forwarders.filter(data => {
        return data.publisher_id == publisherId
    })
    var forwarder
    if (forwarder_raw.length > 0){
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
        axios.post(janusHost + '/' + sessionId + '/' + adminId, {
            janus: "message",
            transaction: "list all rtp forwards",
            apisecret: "janusrocks",
            body: {
                request: "listforwarders",
                room: roomId,
                secret: "adminpwd"
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
                    janusHost + '/' + sessionId + '/' + adminId, {
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
var publisherId = 4047519273076980
var roomId = 1234
var audioPort = 10033
var videoPort = 10038
var streamName = 'nihao'

function startForwarding(roomId, publisherId) {
    createSession().then(createHandler)
        .then(() => { return new Promise(resolve => resolve([roomId, publisherId])) })
        .then(clearForwarders)
    .then(createFowarder)
    .then(res => console.log(JSON.stringify(res)))
}


startForwarding(roomId, publisherId)
createFFmpeg(ffmpegHost, audioPort, videoPort, streamName)







