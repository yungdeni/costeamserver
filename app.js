const express = require('express');
const axios = require('axios')
const fs = require("fs");
const mongoose = require('mongoose')
const Game = require('./models/game')
const app = express();
const port = 3001;


const secretsRaw = fs.readFileSync("secrets.txt")
const secrets = JSON.parse(secretsRaw)
const dbConnString = `mongodb+srv://denkar:${secrets.password}@costeamdb.rge7l.mongodb.net/Costeam`

mongoose.connect(dbConnString);


const testGame = new Game({
    headerimage: 'https://cdn.akamai.steamstatic.com/steam/apps/10/header.jpg?t=1602535893',
    appid: 10,
    multiplayer: true,
    name: 'Counter-Strike',
})

testGame.save().then(result => {
    console.log("saved")
}).catch((error) => {
    console.log(error);
}).finally(() => {
    mongoose.connection.close()
})

const getFriendsSteamIds = async (steamid) => {
    console.log(steamid)
    const url = `http://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${secrets.key}&steamid=${steamid}&relationship=friend`;
    try {
        let res = await axios.get(url);
        return res.data.friendslist.friends;
    } catch (error) {
        console.error(error);
    }
}

const getFriends = async (steamid) => {
    try {
        let friends = await getFriendsSteamIds(steamid);
        let resultParam = friends.map(a => a.steamid).join(',');
        //console.log(resultParam);
        let res = await axios.get(`http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${secrets.key}&steamids=${resultParam}`);
        return res.data.response.players

    }
    catch (error) {
        console.error(error);
    }
}

const getOwnedGames = async (steamid) => {
    const url = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${secrets.key}&steamid=${steamid}`
    try {
        let res = await axios.get(url);
        return res.data.response.games
    }
    catch (error) {
        console.error(error);
    }
}
//should be fixed
const getCommonGames = async (steamids) => {
    let commonGames = [];
    for (const id of steamids) {
        let games = await getOwnedGames(id);
        games = games.map(game => game.appid);
        console.log(games)
        if (commonGames.length == 0) {
            commonGames = commonGames.concat(games);  
        }
        else{
            commonGames = commonGames.concat(games);  
            commonGames = getOnlyDuplicates(commonGames);
        }      
    }
    
    return commonGames

}
const getOnlyDuplicates = (appids) => {
    return [...new Set(appids.filter((e, i, a) => a.indexOf(e) !== i))]
}
const isValidSteamId = (steamid) => {
    const steamidValidation = new RegExp('^[0-9]{17}$');
    return steamidValidation.test(steamid);
}


//example route http://localhost:3001/friends?id=76561198002549124
app.get('/friends', async (req, res) => {
    
    if (isValidSteamId(req.query.id)) {
        res.send(await getFriends(req.query.id));
    }
    else {
        res.send("Invalid steamid");
    }

});

//let tesssst = await getCommonGames(['76561198055771121','76561198002549124','76561197962882171'])
const tessst = async () => {
    let bla = await getCommonGames(['76561198055771121','76561198002549124','76561197962882171'])
    console.log(bla)
}
//tessst()

app.get('/games', async (req, res) => {
    if (!Array.isArray(req.query.id)) {
        res.send("Need atleast two steamids")
    }
    else{
        if (req.query.id.every(isValidSteamId)) {
            res.send(await getCommonGames(req.query.id))
        }
        else {
            res.send("One or more steamids were invalid")
        }
    }
    //res.send(await getOwnedGames(req.query.id))
    
})



app.listen(port, () => {
    console.log("test")
});


