-- AI Journal: startet den Journal-Server im Hintergrund und öffnet die App im Browser.
-- Solange dieses Programm läuft (Symbol im Dock), läuft der Server.
-- Beenden (⌘Q oder Rechtsklick im Dock → Beenden) stoppt den Server.
-- Klick auf das Dock-Symbol öffnet den Browser erneut.
-- Wird von scripts/make-app.sh mit osacompile übersetzt; __ROOT__ wird durch den Repo-Pfad ersetzt.

property root : "__ROOT__"
property startedAt : 0

on run
	set startedAt to current date
	do shell script quoted form of (root & "/scripts/launch.sh") & " > /dev/null 2>&1 &"
end run

on reopen
	do shell script quoted form of (root & "/scripts/launch.sh") & " > /dev/null 2>&1 &"
end reopen

on idle
	-- Läuft der Server noch? Wenn nicht, Programm beenden, damit das Dock-Symbol verschwindet.
	-- In den ersten 4 Minuten nicht prüfen: der erste Start nach git pull baut die App neu.
	if ((current date) - startedAt) > 240 then
		try
			do shell script quoted form of (root & "/scripts/status.sh")
		on error
			quit
		end try
	end if
	return 30
end idle

on quit
	try
		do shell script quoted form of (root & "/scripts/stop.sh")
	end try
	continue quit
end quit
