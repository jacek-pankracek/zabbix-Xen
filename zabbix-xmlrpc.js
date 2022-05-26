var XAPI ={
    address : "",
    user : "",
    password : "",

    login: function () {
        XAPI.session = {};
        var resp, rpcReturn = {};
        var req = new HttpRequest();

        var data_json = {
            "methodCall": {
                "methodName": "session.login_with_password",
                "params": {
                    "param": [ 
                        {"value": { "string": XAPI.user}},
                        {"value": {	"string": XAPI.password}},
                        {"value": {	"string": "'1.0"}},
                        {"value": {	"string": "zabbix-integration"}}
                    ]
                }
            }
        };
        
        //console.warn("[XAPI integration] inside Login");

        req.addHeader('Content-Type: text/xml');
        resp = JSON.parse(XML.toJson(req.post("https://" + XAPI.address, XML.fromJson(JSON.stringify(data_json)))));
        resp.methodResponse.params.param.value.struct.member.forEach(function (member) {
            //console.warn("[XAPI integration] member \n" + member.name + "\n" + member.value);
            if (member.name == "Status") {
                rpcReturn.status = member.value;
            } else if (member.name == "Value") {
                XAPI.session = member.value;
            }
        });
        return rpcReturn;
    },

    makeCall: function(methodName){
        var params = [ {"value": { "string": XAPI.session}} ];
        var req = new HttpRequest();
        var rpcReturn = {};

        //console.warn("[XAPI integration] inside makeCall");

        for (var i=1; i<arguments.length; i++){
            params.push({"value": { "string": arguments[i]}})
            //console.warn(JSON.stringify(params));
        };
        var data_json = {
            "methodCall": {
                "methodName": methodName,
                "params": { "param": params }
            }
        };

        req.addHeader('Content-Type: text/xml');
        resp = JSON.parse(XML.toJson(req.post("https://" + XAPI.address, XML.fromJson(JSON.stringify(data_json)))));
        resp.methodResponse.params.param.value.struct.member.forEach(function (member) {
            //console.warn("[XAPI integration] member \n" + member.name + "\n" + member.value);
            if (member.name == "Status") {
                rpcReturn.status = member.value;
            }
        });
        if (rpcReturn.status == "Success"){  
            resp.methodResponse.params.param.value.struct.member.forEach(function (member) {    
                if (member.name == "Value") {
                    try{
                        if (typeof(member.value) === "object" ){
                            if (typeof member.value.boolean != 'undefined'){
                                if (member.value.boolean == "1") { rpcReturn.value = true; }
                                else { rpcReturn.value = false; }
                            }
                            if (typeof member.value["dateTime.iso8601"] != 'undefined' ){
                                rpcReturn.value = member.value["dateTime.iso8601"];
                            }
                            if (typeof member.value.array  != 'undefined'){
                                if (typeof member.value.array.data != 'undefined'){
                                    rpcReturn.value = member.value.array.data.value;
                                }
                            }
                        }
                        if (typeof(member.value) === "string" ){
                            rpcReturn.value = member.value ;
                        }
                    }
                    catch (error) {
                        console.warn("[XAPI integration] makeCall " + error);
                        console.warn("[XAPI integration] makeCall " + JSON.stringify(member));
                    }
                }
            });
        }
        if (rpcReturn.status){
            return rpcReturn.value;
        } else {
            return "Failure";
        }

    }
};

function retriveStats(uuid,interval){
    var req = new HttpRequest();
    var stats = {};
    var rrdStats = {};
    var _serverTime = "";
    var serverTime = null;
    var epoch;

    var hostRef = XAPI.makeCall("host.get_all");
    if (typeof hostRef === "string"){
        _serverTime = XAPI.makeCall("host.get_servertime",hostRef);
    } else {
        hostRef.forEach(function (ref){
            _serverTime = XAPI.makeCall("host.get_servertime",ref[0]);
        })
    }

    // 2022-02-22 23:09:54.500+01:00
    // 2 02 20 22 2T 22:09:54Z
 
    serverTime = (  _serverTime.substring(0,4) + "-" + 
                    _serverTime.substring(4,6) + "-" +
                    _serverTime.substring(6,8) + " " +
                    _serverTime.substring(9,17) + "+00:00" )

    console.warn("epoch" + Date.parse(serverTime));
    //console.warn("czas " + serverTime);

    // curl -k --user root:czekolada https://10.112.136.113/rrd_updates?start=`date +%s`&host=true&cf=AVERAGE
    // &uuid=x
    // start=epoch
    // host=true
    // cf=AVERAGE|MIN|MAX

   

    epoch = Date.parse(serverTime);
    epoch = ((epoch / 1000 ) - interval * 2); 

    console.warn("-epoch" + epoch);


    req.setHttpAuth(HTTPAUTH_BASIC, XAPI.user, XAPI.password)

    //var rrdUrl = ("https://" + XAPI.address + "/rrd_updates?start=" + epoch + "&cf=AVERAGE&uuid=" + uuid)
    var rrdUrl = ("https://" + XAPI.address + "/rrd_updates?start=" + 
            epoch + "&cf=AVERAGE&interval=" + interval +  "&host=true");

    console.warn(rrdUrl);
    rrdStats = JSON.parse(XML.toJson(req.get(rrdUrl)));
    //stats = (req.get(rrdUrl));
    
    //console.warn("data.row " + JSON.stringify(rrdStats.xport.data.row));

    var items = []
    items = rrdStats.xport.meta.legend.entry;

    var values = []
    if (typeof rrdStats.xport.data.row.v != "undefined"){
        values = rrdStats.xport.data.row.v
        //console.warn("v: "+JSON.stringify(values));
    } else {
        values = rrdStats.xport.data.row[0].v
        //console.warn("[0]v: "+JSON.stringify(values));
    }
    

    

    //console.warn("items: "+JSON.stringify(items));
    

    try{
        for (var i = 0, len = items.length; i < len; i++) {
            var iuuid
            iuuid = items[i].split(':')[2];
            //console.warn("uuid: " + iuuid);
            stats[iuuid] = {};
        };
    
        //console.warn("stats: " + JSON.stringify(stats));
    
        for (var i = 0, len = items.length; i < len; i++) {
            var iuuid,item,value;
            iuuid = items[i].split(':')[2];
            item = items[i].split(':')[3];
            value = values[i];
            stats[iuuid][item] = value;
            //console.warn("stats." + iuuid + "." + item + " = " + value );
        };

    }
    catch (error) {
        console.warn("[XAPI integration] ERROR " + error);
    }

    //console.warn("stats: " + JSON.stringify(stats));
    XAPI.makeCall("session.logout");
    if (typeof stats[uuid] != "undefined" ){
        return stats[uuid];
    } else {
        return false
    }
}

function hostDiscovery(){
    var hosts =[];
    var hostRef = XAPI.makeCall("host.get_all");
    if (typeof hostRef === "string"){
        //console.warn("host == string");
        var hostName = XAPI.makeCall("host.get_hostname",hostRef);
        var hostUUID = XAPI.makeCall("host.get_uuid",hostRef);
        hosts.push({
            '{#HNAME}'  : hostName,
            '{#HUUID}'  : hostUUID
        })
    } else {
        hostRef.forEach(function (ref){
            var hostName = XAPI.makeCall("host.get_hostname",ref);
            var hostUUID = XAPI.makeCall("host.get_uuid",ref);
            hosts.push({
                '{#HNAME}'  : hostName,
                '{#HUUID}'  : hostUUID
            })
        })
    }
    XAPI.makeCall("session.logout");
    return hosts;
}

function vmDiscovery(){
    var guests = [];
    var hosts = XAPI.makeCall("host.get_all");
    if (typeof hosts === "string"){
        var hostName = XAPI.makeCall("host.get_hostname",hosts);
        var hostUUID = XAPI.makeCall("host.get_uuid",hosts);
        XAPI.makeCall("host.get_resident_VMs",hosts).forEach(function (vmRef){
            var vm = {};
            if (!XAPI.makeCall("VM.get_is_a_template",vmRef)){
                if (!XAPI.makeCall("VM.get_is_a_snapshot",vmRef)){
                    vm = {  '{#VMNAME}' : XAPI.makeCall("VM.get_name_label",vmRef),
                            '{#VMUUID}' : XAPI.makeCall("VM.get_uuid",vmRef),
                            '{#HNAME}'  : hostName,
                            '{#HUUID}'  : hostUUID };
                    guests.push(vm);
                };
            }
        })
    } else {
        hosts.forEach(function (hostRef){
            var hostName = XAPI.makeCall("host.get_hostname",hostRef);
            var hostUUID = XAPI.makeCall("host.get_uuid",hostRef);
            XAPI.makeCall("host.get_resident_VMs",hostRef).forEach(function (vmRef){
                var vm = {};
                if (!XAPI.makeCall("VM.get_is_a_template",vmRef)){
                    if (!XAPI.makeCall("VM.get_is_a_snapshot",vmRef)){
                        vm = {  '{#VMNAME}' : XAPI.makeCall("VM.get_name_label",vmRef),
                                '{#VMUUID}' : XAPI.makeCall("VM.get_uuid",vmRef),
                                '{#HNAME}'  : hostName,
                                '{#HUUID}'  : hostUUID };
                        guests.push(vm);
                    };
                }
            })
        });
    }
    XAPI.makeCall("session.logout");
    return guests;
};

var params = JSON.parse(value)
var uuid = params.uuid
var interval = params.interval
//var interval = 60 //seconds for agregate

XAPI.address = params.host; // TODO make a setAddress method with http/https trimm
XAPI.user = params.user; // TODO make a setCredentials method
XAPI.password = params.password;


console.warn("[XAPI integration] " + params.action);
if (XAPI.login().status == "Success"){
    switch (params.action) {
        case 'vmdiscovery':
            return (JSON.stringify(vmDiscovery()));
        case 'hostdiscovery':
            return (JSON.stringify(hostDiscovery()));
        case 'retrivevmstats':
            return (JSON.stringify(retriveStats(uuid,interval)));
        default:
            return false;
    }
} else { return false};
