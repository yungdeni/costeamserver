const express = require('express');
const axios = require('axios')
const fs = require("fs");
const mongoose = require('mongoose')
const Game = require('./models/game');
const game = require('./models/game');
const app = express();
const port = 3001;


const secretsRaw = fs.readFileSync("secrets.txt")
const secrets = JSON.parse(secretsRaw)
const dbConnString = `mongodb+srv://denkar:${secrets.password}@costeamdb.rge7l.mongodb.net/Costeam`

mongoose.connect(dbConnString);



app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });


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

const getCommonGames = async (steamids) => {
    let commonGames = [];
    for (const id of steamids) {
        let games = await getOwnedGames(id);
        games = games.map(game => game.appid);
        //console.log(games)
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
const getAppDetailFromSteam = async (appid) => {
    const url = `http://store.steampowered.com/api/appdetails/?appids=${appid}`
    try {
        let res = await axios.get(url);
        //bracket notation to "dot into" the result json 
        if (res.data[appid].success) {
            return res.data[appid];
        }
        return undefined;
        
    }
    catch (error){
        console.error(error);
        return undefined
    }
}

const addMissingGameToDb = async (appid) => {
    gameData = await getAppDetailFromSteam(appid);
    if (gameData === undefined) {
        console.log(`Appid: ${appid} could not be found from steam servers`)
    }
    else{
        let isMulti = gameData.data.categories.some(function(o){return o["id"] === 1});
        //console.log(isMulti)
        const gameToSave = new Game({
            appid: gameData.data.steam_appid,
            name: gameData.data.name,
            headerimage: gameData.data.header_image,
            multiplayer: isMulti
        })
        gameToSave.save().then(result => {
            console.log(`saved appid: ${appid}`)
        }).catch((error) => {
            console.log(error);
        })

    }
}

const getOnlyDuplicates = (appids) => {
    return [...new Set(appids.filter((e, i, a) => a.indexOf(e) !== i))]
}
const isValidSteamId = (steamid) => {
    const steamidValidation = new RegExp('^[0-9]{17}$');
    return steamidValidation.test(steamid);
}

const filterElementsfromArray = (arrA, arrB) => {
    const itemsToDelete = new Set(arrB);
    const filtered = arrA.filter((v) => {
        return !itemsToDelete.has(v);
    })
    return filtered
}

const returnGamesToFetch = async (appids) => {
    try {
        const results = await Game.find({appid: { $in: appids}});
        var found = results.map(g => g.appid);
        return filterElementsfromArray(appids,found);
    }
    catch (error) {
        console.log(error);
        }    
    return undefined;
}

const getGamesFromDB = async (appids) => {
    try {
        const results = await Game.find({appid: { $in: appids}});
        return results;
    }
    catch (error){
        console.log(error);
    }
    return undefined;
}



const handleGamesRequest = async (steamids) => {
    const gamesInCommon = await getCommonGames(steamids);
    if (gamesInCommon.length == 0 || gamesInCommon == undefined) {
        return {'Error': "No games in common or no data found"}
    }
    const gamesToFetch = await returnGamesToFetch(gamesInCommon);
    if (gamesToFetch.length == 0 || gamesToFetch == undefined) {
        return await getGamesFromDB(gamesInCommon);
    }
    else{
        for (const g of gamesToFetch) {
            await addMissingGameToDb(g);
        }
    }
    return getGamesFromDB(gamesInCommon)
}

//slow, might need cachin or filtering out friends that have been logged off for a long time
const handleRecommendRequest = async (steamid) => {
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const monthinSec = 2629743
    const friends = await getFriends(steamid)
    const filteredFriends = friends.filter(friend => friend.communityvisibilitystate == 3 && friend.lastlogoff > (currentTimestamp - monthinSec))
    console.log(friends.length)
    console.log(filteredFriends.length)
    const myGames = await getOwnedGames(steamid)
    const myGamesMap = myGames.map(g => g.appid)
    let gamesFriendsPlay = {};

    for (const friend of filteredFriends) {
        let games = await getOwnedGames(friend.steamid)
       
        
        if (games != undefined) {
            let gamesMap = games.map(g => { return {appid: g.appid, playtime_forever: g.playtime_forever}})
            //console.log(gamesMap)
            for (const game of gamesMap) {
                if (myGamesMap.includes(game.appid)) {
                    continue
                }
                else if (game.appid in gamesFriendsPlay) {
                    gamesFriendsPlay[game.appid].playtime_forever += game.playtime_forever
                    gamesFriendsPlay[game.appid].players += 1
                }
                else {
                    gamesFriendsPlay[game.appid] = {players: 1, playtime_forever : game.playtime_forever}
                }
            }  
        }
        
    }
    let filtered = Object.fromEntries(Object.entries(gamesFriendsPlay).filter(([k,v]) => v.players > 2 && v.playtime_forever > 1000));

    return filtered
    
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


const tessst = async () => {
    let bla = await handleRecommendRequest('76561198002549124')
    //console.log(bla)
}


app.get('/games', async (req, res) => {
    if (!Array.isArray(req.query.id)) {
        res.send("Need atleast two steamids")
    }
    else{
        if (req.query.id.every(isValidSteamId)) {
            res.send(await handleGamesRequest(req.query.id))
        }
        else {
            res.send("One or more steamids were invalid")
        }
    }

    
})

app.get('/recommended', async (req, res) => {
    if (isValidSteamId(req.query.id)) {
        res.send(await handleRecommendRequest(req.query.id))
    }
    else {
        res.send("Invalid steamid")
    }
})


app.listen(port, () => {
});


process.on('SIGINT', function() {
    mongoose.connection.close(function () {
      console.log('Mongoose disconnected on app termination');
      process.exit(0);
    });
  });