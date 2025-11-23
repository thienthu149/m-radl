import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export const useLeaderboard = (currentUserId) => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentUserRank, setCurrentUserRank] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Query the top 50 riders ordered by points
    const q = query(
      collection(db, 'points'), 
      orderBy('points', 'desc'), 
      limit(10)
    );

    // 2. Listen to the Points updates
    const unsub = onSnapshot(q, async (snapshot) => {
      
      // A. Map the raw points data first
      const rawData = snapshot.docs.map((doc, index) => {
        const rank = index + 1;
        
        // Badge Logic
        let badge = `#${rank}`;
        if (rank === 1) badge = "🥇";
        if (rank === 2) badge = "🥈";
        if (rank === 3) badge = "🥉";

        return {
          id: doc.id, // This is the UID
          points: doc.data().points || 0,
          rank: rank,
          badge: badge,
          name: "Loading..." // Temporary placeholder
        };
      });

      // B. Fetch Usernames from 'userinformation' collection
      // We use Promise.all to fetch them all in parallel (Client-side Join)
      const mergedData = await Promise.all(rawData.map(async (rider) => {
        try {
            const userDocRef = doc(db, 'userinformation', rider.id);
            const userSnap = await getDoc(userDocRef);
            
            let finalName = `Rider ${rider.id.substring(0, 3)}`; // Fallback
            
            if (userSnap.exists() && userSnap.data().username) {
                finalName = userSnap.data().username;
            }
            
            return { ...rider, name: finalName };
        } catch (err) {
            console.error("Error fetching name for", rider.id, err);
            return rider;
        }
      }));

      setLeaderboard(mergedData);
      setLoading(false);

      // C. Handle "Current User" Logic
      if (currentUserId) {
        const myEntry = mergedData.find(user => user.id === currentUserId);
        
        if (myEntry) {
          setCurrentUserRank(myEntry);
        } else {
          // If user is not in top 50, we need to fetch their data individually
          // 1. Get their points
          const myPointsSnap = await getDoc(doc(db, 'points', currentUserId));
          // 2. Get their name
          const myInfoSnap = await getDoc(doc(db, 'userinformation', currentUserId));
          
          const myPoints = myPointsSnap.exists() ? myPointsSnap.data().points : 0;
          const myName = (myInfoSnap.exists() && myInfoSnap.data().username) 
                          ? myInfoSnap.data().username 
                          : "You";

          setCurrentUserRank({
            id: currentUserId,
            name: myName,
            points: myPoints,
            rank: '-',
            badge: '-'
          });
        }
      }

    }, (error) => {
      console.error("Error fetching leaderboard:", error);
      setLoading(false);
    });

    return () => unsub();
  }, [currentUserId]);

  return { leaderboard, currentUserRank, loading };
};