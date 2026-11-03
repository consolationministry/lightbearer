import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  classifyLiveAudioNetworkQuality,
  createLiveAudioIceCandidateQueue,
  getLiveAudioReconnectDelay,
  readLiveAudioPeerStats,
  getLiveAudioListenerStatus,
  DEFAULT_LIVE_AUDIO_MESH_LISTENER_LIMIT,
  getLiveAudioMeshListenerLimit,
  LIVE_AUDIO_MESH_LISTENER_LIMIT,
  startLiveAudioListener,
  startLiveAudioPublisher
} from "../js/live-audio-webrtc.js";

test("publisher listener limit defaults to fifty and clamps explicit requests to the supported ceiling", () => {
  assert.equal(LIVE_AUDIO_MESH_LISTENER_LIMIT, 50);
  assert.equal(DEFAULT_LIVE_AUDIO_MESH_LISTENER_LIMIT, 50);
  assert.equal(getLiveAudioMeshListenerLimit(), 50);
  assert.equal(getLiveAudioMeshListenerLimit(16), 16);
  assert.equal(getLiveAudioMeshListenerLimit(50), 50);
  assert.equal(getLiveAudioMeshListenerLimit(500), 50);
  assert.equal(getLiveAudioMeshListenerLimit(4), 4);
  assert.equal(getLiveAudioMeshListenerLimit(0), 50);
  assert.equal(getLiveAudioMeshListenerLimit(-10), 1);
  assert.equal(getLiveAudioMeshListenerLimit("not-a-number"), 50);
});

test("publisher answers fifty concurrent listener offers, rejects the fifty-first, and frees capacity on leave", async () => {
  let channelCallbacks;
  const sentMessages = [];
  const peers = [];
  const connectedCounts = [];
  const channel = {
    connected: true,
    send(message) {
      sentMessages.push(message);
      return true;
    },
    close() {}
  };
  const testProgramId = "00000000-0000-4000-8000-000000000001";
  const testSessionId = "00000000-0000-4000-8000-000000000002";
  const stream = { getAudioTracks: () => [{ id: "broadcast-track" }] };
  const publisher = await startLiveAudioPublisher({
    programId: testProgramId,
    sessionId: testSessionId,
    stream,
    maxListeners: 50,
    connectChannel: async (programId, sessionId, callbacks) => {
      channelCallbacks = callbacks;
      return channel;
    },
    createPeerConnection: async () => {
      const peer = {
        connectionState: "new",
        signalingState: "stable",
        addTrack(track, mediaStream) { this.track = track; this.stream = mediaStream; },
        async setRemoteDescription(description) { this.remoteDescription = description; },
        async createAnswer() { return { type: "answer", sdp: "fake-answer" }; },
        async setLocalDescription(description) {
          this.localDescription = description;
          this.signalingState = "stable";
        },
        close() { this.closed = true; }
      };
      peers.push(peer);
      return peer;
    },
    onListenerCount(count) { connectedCounts.push(count); }
  });
  const offer = index => ({
    type: "offer",
    sessionId: testSessionId,
    from: `listener-${index}`,
    to: `host-${testSessionId}`,
    description: { type: "offer", sdp: `fake-offer-${index}` }
  });

  for (let index = 0; index < 50; index += 1) channelCallbacks.onSignal(offer(index));
  for (let turn = 0; turn < 100 && sentMessages.filter(message => message.type === "answer").length < 50; turn += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }

  assert.equal(peers.length, 50);
  assert.equal(peers.filter(peer => peer.track?.id === "broadcast-track" && peer.stream === stream).length, 50);
  assert.equal(sentMessages.filter(message => message.type === "answer").length, 50);
  assert.equal(publisher.listenerCount, 50);
  assert.equal(Math.max(...connectedCounts), 50);

  channelCallbacks.onSignal(offer(50));
  assert.equal(sentMessages.filter(message => message.type === "full").length, 1);
  assert.equal(peers.length, 50);

  channelCallbacks.onSignal({
    type: "leave",
    sessionId: testSessionId,
    from: "listener-0",
    to: `host-${testSessionId}`
  });
  assert.equal(publisher.listenerCount, 49);
  channelCallbacks.onSignal(offer(50));
  for (let turn = 0; turn < 100 && sentMessages.filter(message => message.type === "answer").length < 51; turn += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(peers.length, 51);
  assert.equal(sentMessages.filter(message => message.type === "answer").length, 51);
  assert.equal(publisher.listenerCount, 50);
  await publisher.stop();
  assert.equal(peers.filter(peer => peer.closed).length, 51);
});

test("listener reconnect backoff starts quickly and caps at three seconds", () => {
  assert.equal(getLiveAudioReconnectDelay(0), 250);
  assert.equal(getLiveAudioReconnectDelay(1), 500);
  assert.equal(getLiveAudioReconnectDelay(2), 1000);
  assert.equal(getLiveAudioReconnectDelay(4), 3000);
  assert.equal(getLiveAudioReconnectDelay(20), 3000);
});
test("trickle ICE buffers remote candidates until the SDP description is installed", async () => {
  let finishRemoteDescription;
  const remoteDescriptionReady = new Promise(resolve => {
    finishRemoteDescription = resolve;
  });
  const addedCandidates = [];
  const peer = {
    remoteDescription: null,
    async setRemoteDescription(description) {
      await remoteDescriptionReady;
      this.remoteDescription = description;
    },
    async addIceCandidate(candidate) {
      addedCandidates.push(candidate);
    }
  };
  const queue = createLiveAudioIceCandidateQueue(peer);
  const firstCandidate = { candidate: "candidate:first" };
  const secondCandidate = { candidate: "candidate:second" };

  const settingDescription = queue.setRemoteDescription({ type: "offer", sdp: "offer" });
  await queue.addRemoteCandidate(firstCandidate);
  assert.deepEqual(addedCandidates, []);

  finishRemoteDescription();
  await settingDescription;
  assert.deepEqual(addedCandidates, [firstCandidate]);

  await queue.addRemoteCandidate(secondCandidate);
  assert.deepEqual(addedCandidates, [firstCandidate, secondCandidate]);
});

test("a stale ICE candidate does not stop later queued candidates from being applied", async () => {
  const addedCandidates = [];
  const peer = {
    remoteDescription: null,
    async setRemoteDescription(description) {
      this.remoteDescription = description;
    },
    async addIceCandidate(candidate) {
      if (candidate.stale) throw new Error("stale candidate");
      addedCandidates.push(candidate);
    }
  };
  const queue = createLiveAudioIceCandidateQueue(peer);

  await queue.addRemoteCandidate({ stale: true });
  await queue.addRemoteCandidate({ candidate: "candidate:usable" });
  await queue.setRemoteDescription({ type: "answer", sdp: "answer" });

  assert.deepEqual(addedCandidates, [{ candidate: "candidate:usable" }]);
});

test("ICE restart pauses candidate application until the replacement SDP is installed", async () => {
  const addedCandidates = [];
  const peer = {
    remoteDescription: { type: "answer", sdp: "first answer" },
    async setRemoteDescription(description) { this.remoteDescription = description; },
    async addIceCandidate(candidate) { addedCandidates.push(candidate); }
  };
  const queue = createLiveAudioIceCandidateQueue(peer);
  queue.beginRemoteDescription();
  await queue.addRemoteCandidate({ candidate: "candidate:restart" });
  assert.deepEqual(addedCandidates, []);

  await queue.setRemoteDescription({ type: "offer", sdp: "restart offer" });
  assert.deepEqual(addedCandidates, [{ candidate: "candidate:restart" }]);
});

test("live audio network quality maps stats to five clear quality grades", () => {
  assert.deepEqual(classifyLiveAudioNetworkQuality({ lossPercent: 0.5, jitterMs: 12, rttMs: 100 }), {
    level: 5,
    label: "Excellent"
  });
  assert.equal(classifyLiveAudioNetworkQuality({ lossPercent: 1.5 }).level, 4);
  assert.equal(classifyLiveAudioNetworkQuality({ jitterMs: 70 }).level, 3);
  assert.equal(classifyLiveAudioNetworkQuality({ rttMs: 500 }).level, 2);
  assert.equal(classifyLiveAudioNetworkQuality({ lossPercent: 12 }).level, 1);
  assert.deepEqual(classifyLiveAudioNetworkQuality({}), { level: 0, label: "Checking" });
});

test("selected WebRTC route stats include quality and direct-versus-relay path", () => {
  const stats = new Map([
    ["transport", { id: "transport", type: "transport", selectedCandidatePairId: "pair" }],
    ["pair", {
      id: "pair",
      type: "candidate-pair",
      currentRoundTripTime: 0.12,
      availableOutgoingBitrate: 220000,
      localCandidateId: "local",
      remoteCandidateId: "remote"
    }],
    ["local", { id: "local", type: "local-candidate", candidateType: "relay" }],
    ["remote", { id: "remote", type: "remote-candidate", candidateType: "host" }],
    ["audio", {
      id: "audio",
      type: "remote-inbound-rtp",
      kind: "audio",
      fractionLost: 0.005,
      jitter: 0.015,
      roundTripTime: 0.1
    }]
  ]);

  assert.deepEqual(readLiveAudioPeerStats(stats), {
    level: 5,
    label: "Excellent",
    lossPercent: 0.5,
    jitterMs: 15,
    rttMs: 100,
    route: "Relay"
  });
});

test("publisher and listener trickle ICE candidates instead of waiting for gathering to finish", async () => {
  const source = await readFile(new URL("../js/live-audio-webrtc.js", import.meta.url), "utf8");

  assert.match(source, /peer\.onicecandidate/);
  assert.match(source, /type:\s*"candidate"/);
  assert.match(source, /iceRestart:\s*true/);
  assert.match(source, /scheduleReconnect/);
  assert.doesNotMatch(source, /waitForIceGatheringComplete/);
});

test("live audio status waits for playback and preserves tap-to-play failures", () => {
  assert.equal(getLiveAudioListenerStatus("connected", "connecting"), "connected");
  assert.equal(getLiveAudioListenerStatus("connected", "blocked"), "tap-to-play");
  assert.equal(getLiveAudioListenerStatus("connected", "playing"), "live");
});

test("listener retries native media playback when the remote audio track unmutes", async () => {
  let channelCallbacks;
  let peer;
  const statuses = [];
  const trackListeners = new Map();
  const track = {
    muted: true,
    addEventListener(name, handler) {
      if (!trackListeners.has(name)) trackListeners.set(name, new Set());
      trackListeners.get(name).add(handler);
    },
    removeEventListener(name, handler) {
      trackListeners.get(name)?.delete(handler);
    },
    dispatch(name) {
      (trackListeners.get(name) || []).forEach(handler => handler());
    }
  };
  const audioElement = {
    srcObject: null,
    playCalls: 0,
    play() {
      this.playCalls += 1;
      return Promise.resolve();
    },
    pause() { this.paused = true; }
  };
  const stream = { id: "remote-audio" };
  const channel = {
    connected: true,
    send(message) {
      if (message.type === "offer") {
        queueMicrotask(() => channelCallbacks.onSignal({
          type: "answer",
          sessionId: "session",
          to: message.from,
          description: { type: "answer", sdp: "answer" }
        }));
      }
      return true;
    },
    close() {}
  };

  const listener = await startLiveAudioListener({
    programId: "program",
    sessionId: "session",
    audioElement,
    onStream(nextStream) {
      audioElement.srcObject = nextStream;
      return true;
    },
    onStatus(status) { statuses.push(status); },
    async connectChannel(programId, sessionId, callbacks) {
      channelCallbacks = callbacks;
      return channel;
    },
    async createPeerConnection() {
      peer = {
        connectionState: "new",
        signalingState: "stable",
        addTransceiver() {},
        async createOffer() { return { type: "offer", sdp: "offer" }; },
        async setLocalDescription(description) {
          this.localDescription = description;
          this.signalingState = "have-local-offer";
          this.connectionState = "connected";
          this.onconnectionstatechange();
        },
        async setRemoteDescription(description) {
          this.remoteDescription = description;
          this.signalingState = "stable";
        },
        close() {}
      };
      return peer;
    }
  });

  peer.ontrack({ streams: [stream], track });
  await Promise.resolve();
  assert.equal(audioElement.playCalls, 1);
  assert.notEqual(statuses.at(-1), "live");

  track.muted = false;
  track.dispatch("unmute");
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(audioElement.playCalls, 2);
  assert.equal(statuses.at(-1), "live");
  assert.strictEqual(audioElement.srcObject, stream);
  await listener.stop();
});

test("listener does not replace archive playback when a new live stream arrives", async () => {
  let channelCallbacks;
  let peer;
  let playbackCalls = 0;
  const channel = {
    connected: true,
    send(message) {
      if (message.type === "offer") {
        queueMicrotask(() => channelCallbacks.onSignal({
          type: "answer",
          sessionId: "session",
          to: message.from,
          description: { type: "answer", sdp: "answer" }
        }));
      }
      return true;
    },
    close() {}
  };
  const audioElement = {
    srcObject: null,
    play() {
      playbackCalls += 1;
      return Promise.resolve();
    },
    pause() { this.paused = true; }
  };
  const stream = { id: "reconnected-live" };
  let storedStream;

  const listener = await startLiveAudioListener({
    programId: "program",
    sessionId: "session",
    audioElement,
    onStream(nextStream) {
      storedStream = nextStream;
      return false;
    },
    async connectChannel(programId, sessionId, callbacks) {
      channelCallbacks = callbacks;
      return channel;
    },
    async createPeerConnection() {
      peer = {
        connectionState: "new",
        signalingState: "stable",
        addTransceiver() {},
        async createOffer() { return { type: "offer", sdp: "offer" }; },
        async setLocalDescription(description) {
          this.localDescription = description;
          this.signalingState = "have-local-offer";
          this.connectionState = "connected";
          this.onconnectionstatechange();
        },
        async setRemoteDescription(description) {
          this.remoteDescription = description;
          this.signalingState = "stable";
        },
        close() {}
      };
      return peer;
    }
  });

  peer.ontrack({ streams: [stream], track: { muted: false } });
  await Promise.resolve();

  assert.strictEqual(storedStream, stream);
  assert.equal(audioElement.srcObject, null);
  assert.equal(playbackCalls, 0);
  await listener.stop();
});
