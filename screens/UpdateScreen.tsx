import React, { useEffect, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import VersionCheck from 'react-native-version-check';
import styles from "../assets/styles";

export default function UpdateScreen(){
    const [update, setUpdate] = useState(false);
  const [updateUrl, setUpdateUrl] = useState("");
  const [cur, setCur] = useState("");
  const [lat, setLat] = useState("")

  const onUpdate = ()=>{
    Linking.openURL(updateUrl);
  }
  const getversion =  async() => {
    console.log("첫진입 시작");
    //기기에 설치되 있는 버전
    let CurrentVersion = VersionCheck.getCurrentVersion();
    //앱의 최신버전
    let LatestVersion = await VersionCheck.getLatestVersion();
    
    //기기에 설치되있는 버전과 앱에 올려져있는 최신버전을 비교
    VersionCheck.needUpdate({
      currentVersion: CurrentVersion,
      latestVersion: LatestVersion,
    }).then((res: any) => {
        setCur(res.currentVersion);
        setLat(res.latestVersion);
        console.log(res.currentVersion+"/"+res.latestVersion);
        if (res.isNeeded) {
            setUpdate(true);
        }else{
          setUpdate(false);
        }
        
        if (Platform.OS == "android") {
            setUpdateUrl("https://play.google.com/store/apps/details?id=com.pocket23");
            //Linking.openURL();
        } else {
            setUpdateUrl("http://naver.com");
        }
    });
  }
  useEffect(()=>{
    getversion();
  },[])

    return(
        <View style={styles.USView}>
            <Text style={styles.UPSViewTitle}>최신 버전 업데이트</Text>
            <Text style={styles.UPSViewVer}>현재 버전 {cur}</Text>
            <Text style={styles.UPSViewVer}>최신 버전 {lat}</Text>
            <Pressable style={styles.UPSViewButton} onPress={onUpdate}>
                <Text style={styles.UPSViewTButtonText}>업데이트 진행</Text>
            </Pressable>
        </View>
    )
}