-- PLH NEO Bureau — icône dans la barre des menus (Hammerspoon)
-- Installation : ajouter dans ~/.hammerspoon/init.lua
--   dofile(os.getenv("HOME") .. "/PLH-NEO-PRIVATE/mac/neo-menubar.lua")

local DIR = os.getenv("HOME") .. "/PLH-NEO-PRIVATE"
local URL = "http://localhost:4321"
local LOG = "/tmp/plh-neo.log"

local function sh(cmd, cb)
  -- shell de connexion pour retrouver node (Homebrew, nvm…)
  hs.task.new("/bin/zsh", function(code, out, err) if cb then cb(code, out, err) end end, { "-lc", cmd }):start()
end

local neoRunning = false

local function setTitle()
  local dot = neoRunning and "●" or "○"
  local color = neoRunning and { red = 0.17, green = 0.84, blue = 0.46 } or { white = 0.6 }
  neoMenu:setTitle(hs.styledtext.new(dot, { color = color, font = { size = 11 } }) ..
    hs.styledtext.new(" NEO", { font = { name = ".AppleSystemUIFontBold", size = 12 } }))
end

local function refresh(cb)
  hs.http.asyncGet(URL .. "/api/status", nil, function(code)
    neoRunning = (code == 200)
    setTitle()
    if cb then cb() end
  end)
end

local function openSite() hs.urlevent.openURLWithBundle(URL, "com.google.Chrome") end

local function start(andOpen)
  sh("cd '" .. DIR .. "' && nohup node server.mjs > " .. LOG .. " 2>&1 &", function()
    hs.timer.doAfter(1.2, function() refresh(function()
      if neoRunning then
        hs.notify.new({ title = "NEO Bureau", informativeText = "Serveur démarré" }):send()
        if andOpen then openSite() end
      else
        hs.notify.new({ title = "NEO Bureau", informativeText = "Échec du démarrage — voir le journal" }):send()
      end
    end) end)
  end)
end

local function stop(cb)
  sh("pkill -f 'node server.mjs'", function() hs.timer.doAfter(0.5, function() refresh(cb) end) end)
end

local function update()
  sh("cd '" .. DIR .. "' && git pull -q", function(code, out, err)
    if code ~= 0 then
      hs.notify.new({ title = "NEO Bureau", informativeText = "Mise à jour impossible : " .. (err or "") }):send()
      return
    end
    stop(function() start(false) end)
    hs.notify.new({ title = "NEO Bureau", informativeText = "Mis à jour depuis GitHub" }):send()
  end)
end

local function buildMenu()
  return {
    { title = neoRunning and "● NEO Bureau en marche" or "○ NEO Bureau arrêté", disabled = true },
    { title = "-" },
    { title = "Ouvrir le site", fn = function() if neoRunning then openSite() else start(true) end end },
    { title = neoRunning and "Arrêter" or "Démarrer", fn = function() if neoRunning then stop() else start(true) end end },
    { title = "Redémarrer", fn = function() stop(function() start(false) end) end, disabled = not neoRunning },
    { title = "-" },
    { title = "Mettre à jour (GitHub)", fn = update },
    { title = "Voir le journal", fn = function() sh("open -a Console " .. LOG) end },
  }
end

if neoMenu then neoMenu:delete() end
neoMenu = hs.menubar.new()
neoMenu:setMenu(function() return buildMenu() end)
setTitle()
refresh(function() if not neoRunning then start(true) end end) -- démarrage auto à l’ouverture de session
neoTimer = hs.timer.doEvery(10, function() refresh() end)
