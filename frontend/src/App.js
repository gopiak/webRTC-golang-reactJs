import { render } from "react-dom";
import adapter from "webrtc-adapter";
import { useState, useEffect } from "react";
// import "./index";

import turnConfig from "./config";
const pcConfig = turnConfig;

import { io } from "socket.io-client";

// let socket;
const socket = io(`http://localhost:8085/`);

//Displaying Local Stream and Remote Stream on webpage
const localVideo = document.querySelector("#localVideo");
const remoteVideo = document.querySelector("#remoteVideo");

const App = () => {
  const [roomList, setRoomList] = useState([]);
  const [room, setRoom] = useState("");

  useEffect(() => {
    if (roomList.length === 0) {
      getRoomsList();
    }

    async function getRoomsList() {
      setRoomList([]);
      // setStatus("loading");
      const res = await fetch(`http://localhost:8085/rooms`);
      const json = await res.json();
      setRoomList(json.rooms);
      // setStatus("loaded");
    }
  }, []);







  //Defining some global utility variables
  let isChannelReady = false;
  let isInitiator = false;
  let isStarted = false;
  let localStream;
  let pc;
  let remoteStream;
  let turnReady;




  const localStreamConstraints = {
    audio: true,
    video: true,
  };



  useEffect(() => {
    if (room !== "") {

      socket.emit("create or join", room);
      console.log("Attempted to create or  join room", room);



      console.log("Going to find Local media");
      navigator.mediaDevices
        .getUserMedia(localStreamConstraints)
        .then(gotStream)
        .catch(function (e) {
          alert("getUserMedia() error: " + e.name);
        });
      console.log("Getting user media with constraints", localStreamConstraints);



    }
  }, [room]);


  //Defining socket connections for signalling
  socket.on("created", function (room) {
    console.log("Created room " + room);
    isInitiator = true;
  });

  socket.on("full", function (room) {
    console.log("Room " + room + " is full");
  });

  socket.on("join", function (room) {
    console.log("Another peer made a request to join room " + room);
    console.log("This peer is the initiator of room " + room + "!");
    isChannelReady = true;
  });

  socket.on("joined", function (room) {
    console.log("joined: " + room);
    isChannelReady = true;
  });

  socket.on("log", function (array) {
    console.log.apply(console, array);
  });

  //Driver code
  socket.on("message", function (message, room) {
    console.log("Client received message:", message, room);
    if (message === "got user media") {
      maybeStart();
    } else if (message.type === "offer") {
      if (!isInitiator && !isStarted) {
        maybeStart();
      }
      pc.setRemoteDescription(new RTCSessionDescription(message));
      doAnswer();
    } else if (message.type === "answer" && isStarted) {
      pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === "candidate" && isStarted) {
      const candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate,
      });
      pc.addIceCandidate(candidate);
    } else if (message === "bye" && isStarted) {
      handleRemoteHangup();
    }
  });

  //Function to send message in a room
  function sendMessage(message, room) {
    console.log("Client sending message: ", message, room);
    socket.emit("message", message, room);
  }


  //If found local stream
  function gotStream(stream) {
    console.log("Adding local stream.");
    localStream = stream;
    localVideo.srcObject = stream;
    sendMessage("got user media", room);
    if (isInitiator) {
      maybeStart();
    }
  }



  //If initiator, create the peer connection
  function maybeStart() {
    console.log(">>>>>>> maybeStart() ", isStarted, localStream, isChannelReady);
    if (!isStarted && typeof localStream !== "undefined" && isChannelReady) {
      console.log(">>>>>> creating peer connection");
      createPeerConnection();
      pc.addStream(localStream);
      isStarted = true;
      console.log("isInitiator", isInitiator);
      if (isInitiator) {
        doCall();
      }
    }
  }

  //Sending bye if user closes the window
  window.onbeforeunload = function () {
    sendMessage("bye", room);
  };

  //Creating peer connection
  function createPeerConnection() {
    try {
      pc = new RTCPeerConnection(pcConfig);
      pc.onicecandidate = handleIceCandidate;
      pc.onaddstream = handleRemoteStreamAdded;
      pc.onremovestream = handleRemoteStreamRemoved;
      console.log("Created RTCPeerConnnection");
    } catch (e) {
      console.log("Failed to create PeerConnection, exception: " + e.message);
      alert("Cannot create RTCPeerConnection object.");
      return;
    }
  }

  //Function to handle Ice candidates
  function handleIceCandidate(event) {
    console.log("icecandidate event: ", event);
    if (event.candidate) {
      sendMessage(
        {
          type: "candidate",
          label: event.candidate.sdpMLineIndex,
          id: event.candidate.sdpMid,
          candidate: event.candidate.candidate,
        },
        room
      );
    } else {
      console.log("End of candidates.");
    }
  }

  function handleCreateOfferError(event) {
    console.log("createOffer() error: ", event);
  }

  function doCall() {
    console.log("Sending offer to peer");
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
  }

  function doAnswer() {
    console.log("Sending answer to peer.");
    pc.createAnswer().then(
      setLocalAndSendMessage,
      onCreateSessionDescriptionError
    );
  }

  function setLocalAndSendMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    console.log("setLocalAndSendMessage sending message", sessionDescription);
    sendMessage(sessionDescription, room);
  }

  function onCreateSessionDescriptionError(error) {
    trace("Failed to create session description: " + error.toString());
  }

  function handleRemoteStreamAdded(event) {
    console.log("Remote stream added.");
    remoteStream = event.stream;
    remoteVideo.srcObject = remoteStream;
  }

  function handleRemoteStreamRemoved(event) {
    console.log("Remote stream removed. Event: ", event);
  }

  function hangup() {
    console.log("Hanging up.");
    stop();
    sendMessage("bye", room);
  }

  function handleRemoteHangup() {
    console.log("Session terminated.");
    stop();
    isInitiator = false;
  }

  function stop() {
    isStarted = false;
    pc.close();
    pc = null;
  }






  return (
    <div>
      <h1>Join a room!</h1>

      <label htmlFor="room">
        Rooms
        <select
          id="room"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          onBlur={(e) => setRoom(e.target.value)}
        >
          <option />
          {roomList.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

render(<App />, document.getElementById("root"));
