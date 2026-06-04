import { StyleSheet, Platform } from "react-native";
const Fonts = {
    PretendardBold: "Pretendard-Bold",
    Pretendard: "Pretendard-Medium",
    PretendardThin: "Pretendard-Thin"
}

const ctyles = StyleSheet.create({
    flatBottomPadding: { marginBottom: 65 },


    CSView: { backgroundColor: "#F7F7F7", flex: 1, paddingHorizontal: 24 },
    CSDateView: { paddingVertical: 16 },
    CSDateText: { textAlign: "center", color: "#006665", fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 10, },
    CSLeftChatView: { flexDirection: "row", justifyContent: "space-between" },
    CSLeftChatViewImage: { width: 40, marginRight: 8 },
    CSLeftChatViewContent: { maxWidth: "70%" },
    CSLeftChatViewContentEmpty: { flex: 1 },
    CSLeftChatViewContentName: { color: "#0d0d0d", fontFamily: Fonts.PretendardBold, letterSpacing: -.5, fontSize: 13, },
    CSLeftChatViewContentBallonMother: { flexDirection: "row" },
    CSLeftChatViewContentBallon: { padding: 8, backgroundColor: "#fff", borderRadius: 16, marginTop: 8, flexDirection: "row" },
    CSLeftChatViewContentText: { color: "#0d0d0d", fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 14, lineHeight: 21 },
    CSLeftChatViewContentLastTime: { marginVertical: 4 },
    CSLeftChatViewContentLastTimeText: { color: "#0d0d0d", fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 10, opacity: .5 },
    CSRightChatView: { flexDirection: "row-reverse", justifyContent: "space-between" },
    CSRightChatViewContent: { maxWidth: "70%", alignItems: "flex-end" },
    CSRightChatViewContentBallonMother: { flexDirection: "row" },
    CSRightChatViewContentBallon: { padding: 8, backgroundColor: "#006665", borderRadius: 16, marginTop: 8, flexDirection: "row" },
    CSRightChatViewContentText: { color: "#fff", fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 14, lineHeight: 21 },
    CSRightChatViewContentLastTime: { marginVertical: 4 },
    CSRightChatViewContentLastTimeText: { color: "#0d0d0d", fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 10, opacity: .5 },
    CSRightChatViewContentEmpty: { flex: 1 },
    CSInputTextView: { height: 70, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E6E6E6", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 24 },
    CSInputTextImage: { width: 40, justifyContent: "center" },
    CSInputTextText: { flex: 1, justifyContent: "center" },
    CSInputTextTextInput: { height: 48 },
    CSInputTextSend: { width: 40, alignItems: "flex-end", justifyContent: "center" },
    CSInputTextSendBtn: { backgroundColor: "#006665", width: 40, height: 40, justifyContent: "center", alignItems: "center", borderRadius: 4 },

    CsSScrollView: {},
    CsCShare: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 20, paddingHorizontal: 24, borderTopWidth: 1, borderTopColor: "#F3F3F3" },
    CsCShareImage: { justifyContent: "center", width: 40, marginRight: 8 },
    CsCShareContent: { flex: 1, justifyContent: "center" },
    CsCShareContentTitle: { color: "#0d0d0d", fontFamily: Fonts.PretendardBold, letterSpacing: -.5, fontSize: 14, lineHeight: 21 },
    CsCShareContentDesc: { color: "#0d0d0d", fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 12, lineHeight: 18 },
    CsCShareEtc: { width: 50, marginLeft: 8, justifyContent: "center" },
    CsCShareEtcTime: { color: "#B3B3B3", fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 10, lineHeight: 10, textAlign: "right", width: "100%" },
    CsCShareEtcCount: { color: "#fff", fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 10, width: 20, height: 20, borderRadius: 200, backgroundColor: "#006665", textAlign: "center", textAlignVertical: "center", marginTop: 4 },

    SeSBox: { paddingHorizontal: 24, paddingBottom: 8 },
    SeSSmallTitle: { fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 12, lineHeight: 12, color: "#B3B3B3", paddingVertical: 16 },
    SeSShare: { flexDirection: "row", justifyContent: "space-between" },
    SeSShareLeft: { fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 14, lineHeight: 16, color: "#0D0D0D", paddingVertical: 10 },
    SeSShareRight: { paddingVertical: 10 },
    SeSShareRightText: { fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 12, lineHeight: 12, color: "#0D0D0D", opacity: .3 },

    ssBox01: { padding: 20, borderBottomWidth: 1, borderBottomColor: "#E6E6E6" },
    ssBox01Subject: { fontSize: 16, fontFamily: Fonts.Pretendard, letterSpacing: -.5, color: "#333" },
    ssBox01Content: { fontSize: 14, fontFamily: Fonts.Pretendard, letterSpacing: -.5, color: "#777", marginTop: 8, marginBottom: 13 },
    ssBox01BotRow: { flexDirection: "row", justifyContent: "space-between"},
    ssBox01BotRowText: { fontSize: 13, fontFamily: Fonts.Pretendard, letterSpacing: -.5, color: "#808080" },
    ssBox01BotContArea1: { flex: 1 },
    ssBox01BotContArea2: { width: 70, alignItems: "flex-end", position: "relative" },
    ssBox01BotContArea2Black: { position: "absolute", width: 60, height: 60, backgroundColor: "#000", zIndex: 1, opacity: 0.5 },
    ssBox01BotContArea2Text: { position: "absolute", width: 60, height: 60, zIndex: 2, color: "#fff", textAlign: "center", marginTop: 17, fontFamily: Fonts.PretendardBold, letterSpacing: -.5, fontSize: 13, },


    imp_profile_list01: { flexDirection: "row", justifyContent: "space-between", },
    imp_profile_list01Share : {flexDirection:"row"},
    imp_profile_list01ShareQanIcon: {paddingTop:3, marginLeft:5},
    imp_profile_list01_left: { width: 60, justifyContent: "center" },
    imp_profile_list01_left_img: { width: 40, height: 40, borderRadius: 200, borderWidth: 1 },
    imp_profile_list01_right: { flex: 1 ,paddingBottom:20,},
    imp_profile_list01_right_text01: { fontSize: 14, color: "#000", fontFamily: Fonts.PretendardBold, letterSpacing: -.5, },
    imp_profile_list01_right_text01Cancel : {color:"red"},
    imp_profile_list01_right_text02: { fontSize: 14, color: "#808080", fontFamily: Fonts.Pretendard, letterSpacing: -.5, marginTop: 0 },

    view_avg_star_share : {flexDirection:"row", justifyContent:"center"},
    view_avg_star_share_img : {width:15,height:20,},
    view_avg_star_share_text : {fontSize:13,marginLeft:5,color:"#cd2214"},

    view_avg_star_share2 : {flexDirection:"row", justifyContent:"flex-start"},
    view_avg_star_share_img2 : {width:12,height:15,},
    view_avg_star_share_text2 : {fontSize:11,marginLeft:5,color:"#cd2214"},

    view_avg_star_share3 : {flexDirection:"row", justifyContent:"center",paddingVertical:15,},
    view_avg_star_share_img3 : {width:50,height:50,marginHorizontal:5,},
    view_avg_star_share_text3 : {fontSize:11,marginLeft:5,color:"#cd2214"},

    ssBottomCover: { padding: 20 },
    ssBottomView: {paddingVertical:20,},
    ssBottomSubject: { fontSize: 16, color: "#0D0D0D", fontFamily: Fonts.PretendardBold, letterSpacing: -.5, },
    ssBottomContent: { fontSize: 14, color: "#333", fontFamily: Fonts.Pretendard, letterSpacing: -.5, paddingVertical: 10, lineHeight: 20 },
    ssBottomView2: {},
    ssBottomViewImg: { width: "100%", minHeight:100, maxHeight: 500 },
    ssBottomCommentCountText: { color: "#0d0d0d", fontFamily: Fonts.PretendardBold, letterSpacing: -.5, fontSize: 14, paddingVertical: 10 },

    ssWriteComment: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: "#E6E6E6" },
    ssWriteCommentLeft: { width: 60 },
    ssWriteCommentLeftImg: { width: 40, height: 40, borderRadius: 200, borderWidth: 1 },
    ssWriteCommentRight: { flex: 1 },
    ssWriteCommentRightInput: { fontSize: 14, color: "#0D0D0D", opacity: .5, paddingTop: 10 },

    imp_comment_box01_cover: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#E6E6E6" },
    imp_comment_box01: { flexDirection: "row", paddingVertical: 10, },
    imp_comment_box01_left: { width: 60 },
    imp_comment_box01_left_img: { width: 40, height: 40, borderRadius: 200, borderWidth: 1 },
    imp_comment_box01_right: { flex: 1, paddingTop: 5 },
    imp_comment_box01_right_flex: { flexDirection: "row" },
    imp_comment_box01_right_text01: { fontSize: 14, color: "#0D0D0D", fontFamily: Fonts.PretendardBold, letterSpacing: -.5, },
    imp_comment_box01_right_text01_circle: { fontSize: 12, paddingHorizontal: 10, },
    imp_comment_box01_right_text02: { fontSize: 14, color: "#0D0D0D", fontFamily: Fonts.Pretendard, letterSpacing: -.5, marginTop: 4 },
    imp_comment_box01_right_text03: { fontSize: 13, color: "#808080", fontFamily: Fonts.Pretendard, letterSpacing: -.5, marginTop: 4 },
    imp_comment_box01_right_text03_btn: { marginLeft: 10 },

    scCommentWriteView: { paddingVertical: 10, paddingHorizontal: 20, flexDirection: "row", justifyContent: "space-between" },
    scCommentWriteViewLeft: { flex: 1 },
    scCommentWriteViewRight: {  width: 100, alignItems: "flex-end", justifyContent: "center"},
    scCommentWriteViewRightBtn: { backgroundColor: "#cd2214", width: 40, height: 40, justifyContent: "center", alignItems: "center", borderRadius: 3 ,marginLeft:10},
    scCommentWriteViewRightBtn2: { backgroundColor: "#FF7A6B", width: 40, height: 40, justifyContent: "center", alignItems: "center", borderRadius: 3 ,marginLeft:10},
    scCommentWriteViewRightBtnImg: { width: 20, height: 20 },


    //color: "#0d0d0d", fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 14, 
    RegiModalBox: { zIndex: 3, left: 0, top: 0, position: "absolute", height: "100%", width: "100%", backgroundColor: "#000", opacity: .8 },
    RegiModalBoxItem: { zIndex: 3, left: 0, top: 0, position: "absolute", height: "100%", width: "100%", justifyContent: "center", alignContent: "center", alignItems: "center", },
    RegiModalBoxCont: { width: "90%", backgroundColor: "#fff", zIndex: 5, opacity: 1, borderRadius: 24, padding: 20 },
    RegiModalEditBoxCont: { width: "90%", backgroundColor: "#fff", zIndex: 5, opacity: 1, borderRadius: 4, padding: 4 },
    RegiModalEditBoxContBtn: {},
    RegiModalEditBoxContText: { paddingHorizontal: 20, fontSize: 12, lineHeight: 21, fontFamily: Fonts.Pretendard, letterSpacing: -.5, color: "#0D0D0D", paddingVertical: 8 },
    RegiModalEditBoxContTextDanger: { color: "#BB0F0F" },
    RegiModalTitle: { fontSize: 20, textAlign: "center", fontFamily: Fonts.PretendardBold, letterSpacing: -.5, color: "#0D0D0D", paddingVertical: 24 },
    RegiModalContent: { fontSize: 14, textAlign: "center", lineHeight: 21, fontFamily: Fonts.Pretendard, letterSpacing: -.5, color: "#0D0D0D", opacity: .5 },
    RegiModalBtn: { backgroundColor: "#808080", justifyContent: "center", height: 48, borderRadius: 200 },
    RegiModalBtnActive: { backgroundColor: "#006665", justifyContent: "center", height: 48, borderRadius: 200 },
    RegiModalBtnDanger: { backgroundColor: "#BB0F0F", justifyContent: "center", height: 48, borderRadius: 200 },
    RegiModalBtnText: { color: "#fff", textAlign: "center", fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 14 },
    RegiModalQ: { fontFamily: Fonts.PretendardBold, letterSpacing: -.5, fontSize: 14, color: "#0D0D0D" },
    RegiModalA: { fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 14, color: "#0D0D0D", opacity: .5, marginTop: 8, marginBottom: 16 },

    RegiModalBoxOpacity: { zIndex: 3, left: 0, top: 0, position: "absolute", height: "100%", width: "100%", backgroundColor: "#000", opacity: .0 },
    optionModalView: {
        position: "absolute", right: 24, top: 0, backgroundColor: "#fff", paddingHorizontal: 15, borderRadius: 4, minWidth: 120,
        ...Platform.select({
            ios: {
                shadowColor: "#000",
                shadowOffset: {
                    width: 10,
                    height: 10,
                },
                shadowOpacity: 0.5,
                shadowRadius: 10,
            },
            android: {
                elevation: 20,
            },
        }),
    },
    optionModalViewText: { fontFamily: Fonts.Pretendard, letterSpacing: -.5, fontSize: 13, color: "#0d0d0d" },
    optionModalViewTextDel: { color: "red" },
    optionModalViewPress: { paddingVertical: 8 },


})

export default ctyles;