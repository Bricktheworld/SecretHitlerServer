const selectPair = require('./Classes/SelectPair.js')
const policyTurnManager = require('./Classes/PolicyTurnManager.js')
const presidentialPowerManager = require('./Classes/PresidentialPowerManager.js')
const Player = require('./Classes/Player.js');

const express = require('express');
const app = express();
const shortid = require('shortid')

// Set up the server
// process.env.PORT is related to deploying on heroku
const server = app.listen(process.env.PORT || 80, listen);

// This call back just tells us that the server has started
function listen() {
    const host = server.address().address;
    const port = server.address().port;
    console.log('Example app listening at http://' + host + ':' + port);
}

app.use(express.static('public'));


// WebSocket Portion
// WebSockets work with the HTTP server
const io = require('socket.io')(server);

//actual game, barely anymore networking
const LIBERAL = 0;
const FASCIST = 1;
const HITLER = 2;
const roles = [LIBERAL, LIBERAL, LIBERAL, FASCIST, HITLER];
const extraRoles =
    [[LIBERAL],
    [LIBERAL, FASCIST],
    [LIBERAL, LIBERAL, FASCIST],
    [LIBERAL, LIBERAL, FASCIST, FASCIST],
    [LIBERAL, LIBERAL, LIBERAL, FASCIST, FASCIST]];



let lobbies = [];


class Game {
    constructor(gamePin, owner, ownerID, name, numberOfPlayers, dataObject) {
        this.gamePin = gamePin;
        this.owner = owner;
        this.ownerID = ownerID;
        this.name = name;
        this.numberOfPlayers = numberOfPlayers;
        this.dataObject = dataObject;
        this.roomname = gamePin;

        this.connectedPlayers = [{ name: owner, id: ownerID, role: -1, spectator: false, }];
        this.deadPlayers = [];
        this.fascists = [];
        this.liberals = [];
        this.hitler;

        this.possibleRoles = shuffleArray(roles);

        this.currentPresientIndex = 0;
        this.currentPresident;
        this.currentChancellor;

        this.gameOver = false;
        this.gameStarted = false;

        this.electionTracker = 0;

        this.expectedLength = 5;

        this.excludedPresident = null;
        this.excludedInvestigatedPlayer = null;

        this.policies = [];
        this.discardPolicies = [];
        this.drawPolicies = [];

        this.liberalPolicies = 0;
        this.fascistPolicies = 0;

        // this.selectPair = new SelectPair();
        // this.policyTurnManager = new PolicyTurnManager();
        // this.presidentialPowerManager = new PresidentialPowerManager();
        // initDeck();

    }

    addUser(data) {
        console.log("new user: " + data.name)
        this.connectedPlayers.push(data)
        io.to(this.roomname).emit('update players in lobby', this.connectedPlayers)
    }

    disconnectUser(data) {
        console.log("User Removed: " + data.name)
    }

}

io.sockets.on('connection', function (socket) {
    let loggedIn = false;
    let username;
    let customLobby = null;
    let currentLobby = null;
    let id = shortid.generate();
    socket.emit('connectedToServer', socket.id);

    // socket.on('createLobby', (data) => {
    //     Lobbies[data.pin] = new Game(data.pin);
    //     io.sockets.emit('lobbyCreated', Lobbies)
    //     console.log()
    // })


    socket.on('login', (data) => {
        console.log("User Logged in: " + data)
        loggedIn = true;
        username = data;
        socket.emit('successfully logged in', id);
        socket.emit('sync lobbies', lobbies)
        // loggedIn = true;
        // if (this.connectedPlayers.length <= 0 && this.expectedLength == 5) {
        //     this.possibleRoles = shuffleArray(roles);
        //     console.log("shuffling roles due to only 5");
        // }
        // if (this.connectedPlayers.length >= this.expectedLength) {
        //     return;
        // }
        // player = new Player(socket.id);
        // player.setUsername(data.username);
        // this.connectedPlayers.push(player);
        // // player.setTeam(this.possibleRoles[this.connectedPlayers.length - 1]);

        // // console.log("team: " + player.team);
        // socket.emit('connectedToServer', socket.id);

        // if (this.connectedPlayers.length + this.deadPlayers.length == this.expectedLength) {
        //     console.log("game start");
        //     for (let i = 0; i < this.connectedPlayers.length; i++) {
        //         this.connectedPlayers[i].setTeam(this.possibleRoles[i]);
        //         console.log(this.connectedPlayers[i].username + ":" + this.connectedPlayers[i].team);
        //         if (this.connectedPlayers[i].team == FASCIST) {
        //             this.fascists.push(this.connectedPlayers[i]);
        //         } else if (this.connectedPlayers[i].team == LIBERAL) {
        //             this.liberals.push(this.connectedPlayers[i]);
        //         } else if (this.connectedPlayers[i].team == HITLER) {
        //             this.hitler = this.connectedPlayers[i];
        //         }
        //     }
        //     io.sockets.emit('init', this.connectedPlayers);
        //     this.currentPresientIndex = Math.floor(Math.random() * this.connectedPlayers.length);
        //     setTimeout(init, 2000);
        // }
    })

    socket.on('request players in lobby', () => {

        io.to(currentLobby.roomname).emit('update players in lobby', currentLobby.connectedPlayers)
    })

    socket.on('request join lobby', (data) => {
        for (let i = 0; i < lobbies.length; i++) {
            if (lobbies[i].gamePin === data) {
                socket.emit('joined lobby', lobbies[i]);
                socket.join(lobbies[i].roomname)
                currentLobby = lobbies[i];
                currentLobby.addUser({ name: username, id: id, role: -1, spectator: false })
                return;
            }
        }
        console.log("nonexistent lobby: " + data)
        socket.emit('unable to join lobby');
    })

    socket.on('create lobby', data => {
        console.log("Lobby: " + data.name);
        let lobby = new Game(data.gamePin, data.owner, id, data.name, 5);
        lobbies.push(lobby);
        customLobby = lobby;
        currentLobby = lobby;
        socket.join(lobby.roomname)
        io.sockets.emit('sync lobbies', lobbies)
        socket.emit('joined lobby', data);
    })

    socket.on('requestHitler', () => {
        console.log(socket.id + " requested Hitler");
        if (player.team == 1 || player.team == 2) {
            socket.emit('hitlerPlayer', hitler);
            console.log(socket.id + " request accepted");
        } else {
            console.log(socket.id + " request denied, team: " + player.team);
        }
    });

    socket.on('requestFascist', () => {
        if (player.team == 1 || player.team == 2) {
            socket.emit('fascistPlayers', this.fascists);
        }
    })

    socket.on('selectedChancellor', (data) => {
        console.log("selected Possible Chancellor: " + data.id);
        this.selectPair.requestVoteOnPair(data);
    })
    socket.on('requestKillPlayer', (data) => {
        console.log("killing player: " + data.id);
        this.presidentialPowerManager.killPlayer(data);
    })

    socket.on('removedPolicy', (data) => {
        this.policyTurnManager.removePolicy(data);
    })

    socket.on('policyChosen', (data) => {
        this.policyTurnManager.placePolicy(data);
    })

    socket.on('requestVeto', (data) => {
        console.log(data.length);
        this.presidentialPowerManager.beginVeto(data);
    })
    socket.on('vetoOrNot', (data) => {
        switch (data) {
            case 0:
                this.selectPair.addNay(player);
                break;
            case 1:
                this.selectPair.addYay(player);
                break;
        }
    })

    socket.on('vetoed', () => {
        console.log("VETOED!");
        this.presidentialPowerManager.runVeto();
    })
    socket.on('noVetoed', () => {
        console.log("Not VETOED!");
        this.presidentialPowerManager.failVeto();
    })

    socket.on('killedSelf', () => {
        console.log("Killed self, no longer checking disconnect");
        checkDisconnect = false;
    })

    socket.on('selectedPresident', (data) => {
        this.currentPresident = data;
        this.selectPair.requestNominatedPresidentChooseChancellor(data);
    })

    socket.on('selectedPlayerToInvestigate', (data) => {
        this.presidentialPowerManager.investigatePlayer(data);
    })

    socket.on('disconnect', function () {
        // if (!checkDisconnect) {
        //     return;
        // }
        // if (!this.gameOver && loggedIn && gameStarted) {
        //     endGame(2);
        //     console.log("game close unexpectedly")
        //     loggedIn = false;
        // } else if (loggedIn) {
        //     for (let i = 0; i < this.connectedPlayers.length; i++) {
        //         if (this.connectedPlayers[i].id == socket.id) {
        //             this.connectedPlayers.splice(i, 1);
        //             console.log("Client has disconnected: " + socket.id);
        //             console.log("player length now: " + this.connectedPlayers.length);
        //         }
        //     }
        // }
    });
});





//stolen code lol
function shuffleArray(array) {
    let currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

function init() {
    initDeck();
    this.liberalPolicies = 0;
    this.fascistPolicies = 0;
    this.gameOver = false;
    gameStarted = true;
    io.sockets.emit('gameStart');
    console.log("Game begin")
    this.selectPair.pickPresident();
}

function skipPair() {
    this.selectPair = new this.selectPair();
    this.selectPair.pickPresident();

}

function runPolicyTurn() {
    this.policyTurnManager = new this.policyTurnManager();
    this.policyTurnManager.beginNewTurn();
    console.log("Policy Turn");
}

function initDeck() {
    this.policies = [];
    for (let i = 0; i < 11; i++) {
        this.policies.push(FASCIST);
    }

    for (let i = 0; i < 6; i++) {
        this.policies.push(LIBERAL);
    }
    this.policies = shuffleArray(policies);
    console.log(policies);
    for (let i = 0; i < this.policies.length; i++) {
        console.log(policies[i]);
    }

    this.drawPolicies = this.policies;
}


function runSpecialAbilityCheck() {
    console.log("testing");
    if (this.expectedLength == 5 || this.expectedLength == 6) {
        switch (this.fascistPolicies) {
            case 3:
                setTimeout(this.presidentialPowerManager.examineTopThreeCards, 3000);
                break;
            case 4:
                setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
                break;
            case 5:
                setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
                break;
            default:
                setTimeout(skipPair, 1500);
                break;
        }
    } else if (this.expectedLength == 7 || this.expectedLength == 8) {
        switch (this.fascistPolicies) {
            case 2:
                setTimeout(this.presidentialPowerManager.requestInvestigation, 3000);
                break;
            case 3:
                setTimeout(this.presidentialPowerManager.beginSpecialElection, 3000);
                break;
            case 4:
                setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
                break;
            case 5:
                setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
                break;
            default:
                setTimeout(skipPair, 1500);
                break;
        }
    } else if (this.expectedLength == 9 || this.expectedLength == 10) {
        switch (this.fascistPolicies) {
            case 1:
                setTimeout(this.presidentialPowerManager.requestInvestigation, 3000);
                break;
            case 2:
                setTimeout(this.presidentialPowerManager.requestInvestigation, 3000);
                break;
            case 3:
                setTimeout(this.presidentialPowerManager.beginSpecialElection, 3000);
                break;
            case 4:
                setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
                break;
            case 5:
                setTimeout(this.presidentialPowerManager.requestKillAPlayer, 3000);
                break;
            default:
                setTimeout(skipPair, 1500);
                break;
        }
    }

}

function checkElectionTracker() {
    if (electionTracker >= 3) {
        this.policyTurnManager.placePolicyAutoElectionTracker();
        electionTracker = 0;
        io.sockets.emit('ElectionTrackerReachMax');
        return true;
    }
    return false;
}

function endGame(winner) {
    this.gameOver = true;
    io.sockets.emit('this.gameOver', [winner, hitler, this.fascists]);
    this.connectedPlayers = [];
    this.deadPlayers = [];
    hitler = null;
    this.liberals = [];
    this.fascists = [];
    this.possibleRoles = shuffleArray(roles);
    this.policies = [];
    this.discardPolicies = [];
    this.drawPolicies = [];
    gameStarted = false;

    this.liberalPolicies = 0;
    this.fascistPolicies = 0;

    this.currentPresientIndex = 0;
    this.currentPresident = null;
    currentChancellor = null;

    this.lobbyCreated = false;

    this.expectedLength = 5;


    this.excludedPresident = null;
    this.excludedInvestigatedPlayer = null;

    electionTracker = 0;

    this.selectPair = new this.selectPair();
    this.policyTurnManager = new this.policyTurnManager();
    this.presidentialPowerManager = new this.presidentialPowerManager();
    initDeck();
}

