
const os = require('os');
const express = require('express');
const cors = require('cors')
const app = express()

app.use(cors())
const http = require('http');
//For signalling in WebRTC
const socketIO = require('socket.io');


// app.use(express.static('public'))

const rooms = ['one', 'two', 'three', 'four', 'five'];

app.get("/rooms", function (req, res) {
	res.status(200).send({ "rooms": rooms });
});

const server = http.createServer(app);

server.listen(8085);

const io = socketIO(server);

io.sockets.on('connection', function (socket) {

	// Convenience function to log server messages on the client.
	// Arguments is an array like object which contains all the arguments of log(). 
	// To push all the arguments of log() in array, we have to use apply().
	function log() {
		const array = ['Message from server:'];
		array.push.apply(array, arguments);
		socket.emit('log', array);
	}


	//Defining Socket Connections
	socket.on('message', function (message, room) {
		log('Client said: ', message);
		// for a real app, would be room-only (not broadcast)
		socket.in(room).emit('message', message, room);
	});

	socket.on('create or join', function (room) {
		log('Received request to create or join room ' + room);

		const clientsInRoom = io.sockets.adapter.rooms[room];
		const numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
		log('Room ' + room + ' now has ' + numClients + ' client(s)');

		if (numClients === 0) {
			socket.join(room);
			log('Client ID ' + socket.id + ' created room ' + room);
			socket.emit('created', room, socket.id);

		} else if (numClients === 1) {
			log('Client ID ' + socket.id + ' joined room ' + room);
			io.sockets.in(room).emit('join', room);
			socket.join(room);
			socket.emit('joined', room, socket.id);
			io.sockets.in(room).emit('ready');
		} else { // max two clients
			socket.emit('full', room);
		}
	});

	socket.on('ipaddr', function () {
		const ifaces = os.networkInterfaces();
		for (const dev in ifaces) {
			ifaces[dev].forEach(function (details) {
				if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
					socket.emit('ipaddr', details.address);
				}
			});
		}
	});

	socket.on('bye', function () {
		console.log('received bye');
	});

});