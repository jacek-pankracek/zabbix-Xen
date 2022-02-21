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
        
        console.warn("[XAPI integration] inside Login");

        req.addHeader('Content-Type: text/xml');
        resp = JSON.parse(XML.toJson(req.post("https://" + XAPI.address, XML.fromJson(JSON.stringify(data_json)))));
        resp.methodResponse.params.param.value.struct.member.forEach(function (member) {
            console.warn("[XAPI integration] member \n" + member.name + "\n" + member.value);
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

        console.warn("[XAPI integration] inside makeCall");

        for (var i=1; i<arguments.length; i++){
            params.push({"value": { "string": arguments[i]}})
            console.warn(JSON.stringify(params));
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
            console.warn("[XAPI integration] member \n" + member.name + "\n" + member.value);
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
                            if (typeof member.value.array.data  != 'undefined'){
                                rpcReturn.value = member.value.array.data.value;
                            }
                        }
                        if (typeof(member.value) === "string" ){
                            rpcReturn.value = member.value ;
                        }
                    }
                    catch (error) {
                        console.warn("[XAPI integration] makeCall " + error);
                        console.warn("[XAPI integration] makeCall " + JSON.stringify(member.value));
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
    return guests;
};

var params = JSON.parse(value)

//console.warn(JSON.stringify(params));


// run script with param action = vmdiscovery

XAPI.address = params.host; // TODO make a setAddress method with http/https trimm
XAPI.user = params.user; // TODO make a setCredentials method
XAPI.password = params.password;


console.warn(params.action);
if (XAPI.login().status == "Success"){
    if (params.action == "vmdiscovery") {
        return (JSON.stringify(vmDiscovery())); 
        //console.warn(JSON.stringify(vmDiscovery()));
    } else if (params.action == "hostdiscovery"){
        return (JSON.stringify(hostDiscovery())); 

    }  else { return false };
} else { return false};
